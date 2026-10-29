import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { extractAttachment } from '../server/attachments.js';
import { readSavedSpreadsheets } from '../server/spreadsheet-reading.js';
import { readSavedMaterials } from '../server/material-reading.js';
import { buildSources, selectContext } from '../server/sources.js';
import { publicSnapshot } from '../server/store.js';
import { materialReadUrl } from '../server/material-reader.js';
import { memoryDb } from './memory-db.js';
function workbook(sheet, extra = {}) {
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries({
          'xl/workbook.xml':
            '<workbook><sheets><sheet name="Evidências" sheetId="1" r:id="r1" state="hidden"/></sheets></workbook>',
          'xl/_rels/workbook.xml.rels':
            '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
          'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheet}</sheetData></worksheet>`,
          ...extra,
        }).map(([k, v]) => [k, strToU8(v)]),
      ),
    ),
  );
}
const bytes = workbook(
  '<row r="1"><c r="A1" t="inlineStr"><is><t>Marca &amp; Grupo</t></is></c><c r="B1" t="s"><v>0</v></c><c r="C1" s="1"><v>45945</v></c><c r="D1"><f>1+1</f><v>2</v></c><c r="E1"><f>WEBSERVICE("https://never.test")</f></c></row>',
  {
    'xl/sharedStrings.xml': '<sst><si><t>Resposta recebida</t></si></sst>',
    'xl/styles.xml':
      '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  },
);
test('XLSX reads cells, hidden sheets, dates and saved formulas without executing formulas', async () => {
  const r = await extractAttachment(bytes, 'application/octet-stream', 'evidencia.xlsx');
  assert.equal(r.textStatus, 'readable');
  assert.match(r.text, /Evidências \(oculta no arquivo\)/);
  assert.match(r.text, /Evidências!A1: Marca & Grupo/);
  assert.match(r.text, /B1: Resposta recebida/);
  assert.match(r.text, /C1: 2025-10-15/);
  assert.match(r.text, /D1: 2 \[fórmula: 1\+1; sem recálculo\]/);
  assert.match(r.text, /E1: resultado não salvo/);
});
test('malformed XLSX becomes a visible gap', async () => {
  const result = await extractAttachment(
    workbook(
      '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><row><c r="A1" t="inlineStr"><is><t>&a;</t></is></c></row>',
    ),
    '',
    'bad.xlsx',
  );
  assert.equal(result.textStatus, 'unreadable');
});
function saved() {
  return [
    {
      kind: 'files',
      task_key: 'files',
      payload: {
        data: [{ id: 7, name: 'evidencia.xlsx', file_name: 'opaque', add_time: '2026-10-29' }],
      },
    },
    {
      kind: 'attachment',
      task_key: 'original',
      payload: {
        data: {
          fileId: 7,
          name: 'opaque',
          storagePath: 'user/snapshot/file',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
          mime: 'application/octet-stream',
          textStatus: 'unsupported',
          text: '',
        },
      },
    },
  ];
}
test('reads old preserved spreadsheets once, appends derived text and leaves original citations unchanged', async () => {
  const pages = saved(),
    before = structuredClone(pages),
    db = memoryDb();
  let downloads = 0;
  db.storage = {
    from: () => ({
      download: async () => {
        downloads++;
        return { data: new Blob([bytes]) };
      },
    }),
  };
  const result = await readSavedSpreadsheets(db, { id: 'snapshot' }, pages);
  assert.equal(result.files[0].status, 'readable');
  assert.equal(result.processed, 1);
  assert.deepEqual(pages.slice(0, 2), before);
  assert.equal(db.tables.crm_raw_pages[0].kind, 'attachmentText');
  assert.match(
    buildSources(pages).find((s) => s.kind === 'attachment' && s.attachmentStatus === 'readable')
      .text,
    /Resposta recebida/,
  );
  await readSavedSpreadsheets(db, { id: 'snapshot' }, pages);
  assert.equal(downloads, 1);
  db.storage.from = () => ({ download: async () => ({ data: new Blob(['tampered']) }) });
  await assert.rejects(
    readSavedSpreadsheets(db, { id: 'snapshot' }, saved()),
    (e) => e.code === 'invalid_attachment',
  );
});
test('material reads include proposal and GD, cache captured evidence and expose restricted access without fabricated text', async () => {
  const pages = [
    {
      kind: 'deal',
      task_key: 'deal',
      payload: {
        data: {
          id: 7,
          'Link Proposta': 'https://docs.google.com/document/d/test/edit',
          'Relatório HTML GD': 'https://report.branddi.com/cliente/gd',
        },
      },
    },
  ];
  let calls = 0;
  const db = memoryDb();
  const reader = async (url) => {
    calls++;
    if (url.includes('docs.google'))
      throw Object.assign(new Error('private'), { code: 'restricted' });
    return { text: 'Em quarentena: 2. Takedown: 0.' };
  };
  await readSavedMaterials(db, { id: 'snapshot' }, pages, reader);
  await readSavedMaterials(db, { id: 'snapshot' }, pages, reader);
  assert.equal(calls, 2);
  assert.equal(pages.filter((p) => p.kind === 'materialText').length, 2);
  assert.ok(
    buildSources(pages).some((s) => s.kind === 'material' && s.text.includes('Em quarentena: 2')),
  );
  assert.equal(pages.find((p) => p.payload.data.textStatus === 'unreadable').payload.data.text, '');
  assert.equal(materialReadUrl('https://report.branddi.com/cliente/gd').pathname, '/cliente/gd');
  assert.throws(() => materialReadUrl('https://report.branddi.com/private/admin'), /manual/);
});
test('commercial context includes prior meeting, refusal, resignation, recent reply, Raio-X and worksheet summary despite automation volume', () => {
  const page = (kind, data, key) => ({ kind, payload: { data }, task_key: key });
  const notes = [
    {
      id: 1,
      content:
        'Histórico agrupado. Reunião em 15/10: migrou para plataforma nova. ' +
        'histórico '.repeat(800) +
        'Não houve aprovação interna.',
    },
    { id: 2, content: 'Contato pediu remover o contato e não ser contatado.' },
    { id: 3, content: 'Contato informou: saí da empresa há dois meses.' },
    { id: 4, content: 'Raio-X pré-reunião: marca integra grupo com duas marcas.' },
  ];
  const activities = Array.from({ length: 100 }, (_, i) => ({
    id: 100 + i,
    subject: '[Auto] reunião grupo proposta',
    type: 'email',
    note: 'modelo comercial '.repeat(300),
    add_time: '2026-10-29',
  }));
  activities.push({
    id: 5,
    subject: 'WhatsApp',
    type: 'whatsapp',
    note: 'Lead: podemos falar na sexta às 15h.',
    add_time: '2026-10-26',
  });
  const sources = buildSources([
    page('notes', notes, 'notes'),
    page('activities', activities, 'acts'),
    page(
      'flow',
      notes.map((n) => ({ object: 'note', data: n })),
      'flow',
    ),
    page(
      'attachmentText',
      {
        name: 'evidencias.xlsx',
        textStatus: 'readable',
        text: 'Resumo!A1: 2 casos em quarentena. ' + 'domínios '.repeat(6000),
      },
      'xlsx',
    ),
  ]);
  const context = selectContext(sources, 'reunião grupo proposta', 100000, 5);
  for (const id of ['1', '2', '3', '4', '5'])
    assert.ok(context.sources.some((s) => s.recordId === id && s.primary));
  assert.ok(context.sources.some((s) => s.recordId === '1' && s.part === 1));
  assert.ok(context.sources.some((s) => s.kind === 'attachment' && s.part === 0));
  assert.ok(!context.sources.some((s) => s.kind === 'flow'));
});

test('automatic analysis waits for XLSX but does not wait for other binary attachments', () => {
  const snapshot = {
    status: 'collecting',
    completed_tasks: 4,
    pending: [
      { kind: 'attachment', name: 'evidence.xlsx' },
      { kind: 'attachment', name: 'image.png' },
    ],
  };
  assert.equal(publicSnapshot(snapshot).analysisReady, false);
  snapshot.pending.shift();
  assert.equal(publicSnapshot(snapshot).analysisReady, true);
});
