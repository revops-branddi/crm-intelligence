import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSources, selectContext } from '../server/sources.js';
import { generateAnswer } from '../server/analysis.js';

for (const [dealId, label] of [
  [17, 'Raio-X pré-reunião'],
  [804, 'Histórico do relacionamento'],
  [99031, 'Histórico agrupado'],
]) {
  test(`general selection protects ${label} for unrelated deal ${dealId}`, () => {
    const page = (kind, data) => ({ kind, task_key: `${dealId}-${kind}`, payload: { data } });
    const notes = Array.from({ length: 100 }, (_, i) => ({
      id: i + 10,
      add_time: '2026-10-29',
      content: `Atualização automática. Reunião grupo diagnóstico oportunidade responsáveis. ${'registro operacional '.repeat(180)}`,
    }));
    notes.push({
      id: 9001,
      add_time: '2024-01-01',
      content: `${label}.\n${'Conversas preservadas. '.repeat(320)}\nDECISAO_ANTERIOR: aprovação interna não obtida.`,
    });
    const sources = buildSources([
      page('deal', { id: dealId, title: `Marca sintética ${dealId}`, owner_id: 2 }),
      page('notes', notes),
      page('activities', [
        {
          id: 7001,
          type: 'whatsapp',
          subject: 'Resposta do contato',
          note: 'Aceito conversar na sexta.',
          add_time: '2026-10-28',
        },
      ]),
      page('attachmentText', {
        fileId: 9,
        name: `evidencias-${dealId}.xlsx`,
        textStatus: 'readable',
        text: 'Evidências!A1: Data da captura\nEvidências!A2: 26/10/2026',
      }),
    ]);
    const selected = selectContext(
      sources,
      'reunião grupo diagnóstico oportunidade responsáveis',
      100000,
      5,
    );
    assert.ok(
      selected.sources.some((s) => s.recordId === '9001' && s.part === 0),
      'briefing note must not be crowded out by routine notes',
    );
    assert.ok(
      selected.sources.some((s) => s.recordId === '9001' && s.text.includes('DECISAO_ANTERIOR')),
      'continuation of briefing note is included',
    );
    assert.ok(selected.sources.some((s) => s.recordId === '7001'));
    assert.ok(selected.sources.some((s) => s.attachmentStatus === 'readable'));
    assert.ok(selected.manifest.omittedChunks > 0);
    assert.ok(selected.manifest.characters <= 100000);
    assert.equal(
      selected.manifest.briefingNotes.selectedChunks,
      selected.manifest.briefingNotes.availableChunks,
    );
  });
}

test('oversized consolidated history remains bounded and discloses incomplete briefing coverage', async () => {
  const sources = buildSources([
    {
      kind: 'notes',
      task_key: 'synthetic-large-history',
      payload: {
        data: [
          { id: 42, content: `Raio-X pré-reunião. ${'Histórico preservado. '.repeat(12000)}` },
        ],
      },
    },
  ]);
  const result = await generateAnswer({
    sources,
    snapshot: { completed_at: '2026-10-29', metrics: {}, gaps: [] },
    mode: 'overview',
    env: { GEMINI_MODEL: 'gemini-test', GEMINI_API_KEY: 'synthetic' },
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    sections: [],
                    gaps: ['Sem decisão comercial documentada no contexto recebido.'],
                    suggestedQuestions: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    }),
  });
  assert.ok(result.context_manifest.characters <= 180000);
  assert.ok(
    result.context_manifest.briefingNotes.selectedChunks <
      result.context_manifest.briefingNotes.availableChunks,
  );
  assert.ok(result.answer.gaps.some((gap) => /Raio-X.*fora do limite/.test(gap)));
});
