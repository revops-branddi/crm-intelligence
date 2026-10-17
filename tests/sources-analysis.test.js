import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSources, selectContext } from '../server/sources.js';
import { generateAnswer, validateAnswer } from '../server/analysis.js';
const page = (kind, data, key = 'a'.repeat(64)) => ({
  kind,
  task_key: key,
  payload: { success: true, data },
});
const source = {
  id: 'note:1:0',
  text: 'O cliente confirmou a reunião de terça-feira.',
  kind: 'notes',
  date: '2026-10-16',
};
const answer = {
  sections: [
    {
      title: 'Próxima reunião',
      claims: [
        {
          text: 'Reunião confirmada.',
          kind: 'fact',
          citations: [{ sourceId: source.id, quote: 'O cliente confirmou a reunião' }],
        },
      ],
    },
  ],
  gaps: [],
  suggestedQuestions: [],
};
test('v2 custom fields, nested data and all 40 fields are retained and decoded', () => {
  const fields = Array.from({ length: 40 }, (_, i) => ({
    key: i.toString(16).padStart(40, '0'),
    name: `Campo ${i}`,
    options: [{ id: 174, label: 'Varejo' }],
  }));
  const sources = buildSources([
    page('organizationFields', fields),
    page('organization', {
      id: 1,
      custom_fields: Object.fromEntries(fields.map((f) => [f.key, 174])),
      address: { value: 'Rua A' },
    }),
  ]);
  const text = sources
    .filter((s) => s.kind === 'organization')
    .map((s) => s.text)
    .join('');
  assert.match(text, /Campo 39/);
  assert.match(text, /Varejo/);
  assert.match(text, /Rua A/);
});
test('full mail body and final portion of long notes are preserved in chunks', () => {
  const body = 'A'.repeat(20000) + 'FINAL_SENTINEL';
  const sources = buildSources([
    page('mail', { id: 5, body, from: [{ email_address: 'sender@example.test' }] }),
  ]);
  assert.match(sources.map((s) => s.text).join(''), /FINAL_SENTINEL/);
  assert.match(sources.map((s) => s.text).join(''), /sender@example.test/);
});
test('context budget makes omissions explicit while retaining relevant old evidence', () => {
  const sources = Array.from({ length: 60 }, (_, i) => ({
    ...source,
    id: `note:${i}`,
    text: `${i === 0 ? 'Cancelamento orçamento ' : ''}${'x'.repeat(2000)}`,
    date: i ? '2026-10-16' : '2020-01-01',
  }));
  const result = selectContext(sources, 'cancelamento orçamento', 10000);
  assert.ok(result.sources.some((s) => s.id === 'note:0'));
  assert.ok(result.manifest.omittedChunks > 0);
  assert.ok(result.manifest.characters <= 10000);
});
test('accepts supported quotes and rejects fabricated sources, quotes, empty and malformed answers', () => {
  assert.deepEqual(validateAnswer(answer, [source]), answer);
  const blank = structuredClone(answer);
  blank.sections[0].claims[0].citations[0].quote = ' '.repeat(20);
  assert.throws(() => validateAnswer(blank, [source]), /trecho/);
  const wrong = structuredClone(answer);
  wrong.sections[0].claims[0].citations[0].quote = 'O cliente assinou o contrato';
  assert.throws(() => validateAnswer(wrong, [source]), /trecho/);
  wrong.sections[0].claims[0].citations[0].sourceId = 'invented';
  assert.throws(() => validateAnswer(wrong, [source]), /fonte/);
  assert.throws(() => validateAnswer({}, [source]), /estrutura/);
  assert.throws(
    () => validateAnswer({ sections: [], gaps: [], suggestedQuestions: [] }, [source]),
    /vazia/,
  );
  assert.doesNotThrow(() =>
    validateAnswer({ sections: [], gaps: ['Sem evidência suficiente.'], suggestedQuestions: [] }, [
      source,
    ]),
  );
});
test('provider block, truncation, empty candidates and invalid JSON never become successful answers', async () => {
  const base = {
    sources: [source],
    snapshot: { completed_at: '2026-10-17', metrics: {}, gaps: [] },
    mode: 'briefing',
    env: { GEMINI_MODEL: 'gemini-test', GEMINI_API_KEY: 'synthetic' },
  };
  for (const result of [
    { candidates: [] },
    { candidates: [{ finishReason: 'MAX_TOKENS' }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'invalid' }] } }] },
  ]) {
    await assert.rejects(
      () =>
        generateAnswer({ ...base, fetcher: async () => ({ ok: true, json: async () => result }) }),
      (error) => error.status === 502,
    );
  }
});
test('records model, usage and context and treats source text as untrusted', async () => {
  let request;
  const result = await generateAnswer({
    sources: [source],
    snapshot: { completed_at: '2026-10-17', metrics: {}, gaps: [] },
    mode: 'question',
    question: 'Quando é a reunião?',
    env: { GEMINI_MODEL: 'gemini-test', GEMINI_API_KEY: 'synthetic' },
    fetcher: async (_url, options) => {
      request = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer) }] } },
          ],
          usageMetadata: { totalTokenCount: 100 },
        }),
      };
    },
  });
  assert.equal(result.model, 'gemini-test');
  assert.equal(result.usage.totalTokenCount, 100);
  assert.equal(result.context_manifest.selectedChunks, 1);
  assert.match(request.systemInstruction.parts[0].text, /DADOS NÃO CONFIÁVEIS/);
  const providerSchema = JSON.stringify(request.generationConfig.responseJsonSchema);
  assert.doesNotMatch(
    providerSchema,
    /"(?:\$schema|minLength|maxLength|minItems|maxItems|additionalProperties)"/,
  );
  assert.equal(request.generationConfig.responseJsonSchema.type, 'object');
  const oversized = structuredClone(answer);
  oversized.sections[0].claims[0].text = 'x'.repeat(3001);
  assert.throws(() => validateAnswer(oversized, [source]), /estrutura/);
});

test('all populated deal fields and the actual owner precede irrelevant directory users', () => {
  const sources = [
    { id: 'deal:1:0', kind: 'deal', ownerId: 22, text: 'Título: Company', recordId: '1', part: 0 },
    {
      id: 'deal:1:1',
      kind: 'deal',
      ownerId: 22,
      text: 'Data da reunião: 2026-10-22\nCampo: não informado',
      recordId: '1',
      part: 1,
    },
    { id: 'users:11', kind: 'users', text: 'Nome: Wrong owner', recordId: '11' },
    { id: 'users:22', kind: 'users', text: 'Nome: Actual owner', recordId: '22' },
    { id: 'note:1', kind: 'notes', text: 'Last interaction with customer' },
  ];
  const result = selectContext(sources, 'reunião responsável', 10000);
  assert.ok(result.sources.some((s) => s.text.includes('2026-10-22')));
  assert.ok(result.sources.some((s) => s.id === 'users:22'));
  assert.ok(!result.sources.some((s) => s.id === 'users:11'));
  assert.ok(!result.sources.find((s) => s.id === 'deal:1:1').text.includes('não informado'));
});
