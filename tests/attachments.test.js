import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { extractAttachment } from '../server/attachments.js';
import { readBytes } from '../server/pipedrive.js';
test('extracts HTML with boundaries and preserves unsupported binary status', async () => {
  const html = await extractAttachment(
    Buffer.from('<p>Uma frase.</p><p>Outra frase.</p>'),
    'text/html',
    'note.html',
  );
  assert.match(html.text, /Uma frase/);
  assert.match(html.text, /Outra frase/);
  const image = await extractAttachment(Buffer.from('image'), 'image/png', 'photo.png');
  assert.equal(image.textStatus, 'unsupported');
});
test('reads docx paragraphs, headers and footnotes without network or HTML rendering', async () => {
  const buffer = Buffer.from(
    zipSync({
      'word/document.xml': strToU8(
        '<w:document><w:body><w:p><w:r><w:t>Proposta comercial sintética.</w:t></w:r></w:p></w:body></w:document>',
      ),
      'word/footnotes.xml': strToU8('<w:p><w:t>Pagamento em 30 dias.</w:t></w:p>'),
    }),
  );
  const result = await extractAttachment(
    buffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'proposal.docx',
  );
  assert.equal(result.textStatus, 'readable');
  assert.match(result.text, /Proposta comercial/);
  assert.match(result.text, /Pagamento em 30 dias/);
});
test('malformed pdf is a visible reading gap', async () => {
  const result = await extractAttachment(Buffer.from('invalid'), 'application/pdf', 'broken.pdf');
  assert.equal(result.textStatus, 'unreadable');
});
test('stream limits are enforced even without content-length', async () => {
  const response = new Response(new Uint8Array(100));
  await assert.rejects(
    () => readBytes(response, 50),
    (error) => error.status === 413,
  );
});

test('extracts actual PDF text in the isolated worker', async () => {
  const content = 'BT /F1 12 Tf 72 720 Td (Synthetic proposal payment in 30 days.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extractAttachment(Buffer.from(pdf), 'application/pdf', 'proposal.pdf');
  assert.equal(result.textStatus, 'readable');
  assert.match(result.text, /payment in 30 days/);
});
