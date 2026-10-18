import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAnswer, validateAnswer, validateSupportedAnswer } from '../server/analysis.js';
import {
  analysisConfiguration,
  superproxyCompletion,
  superproxySchema,
} from '../server/llm-provider.js';
const source = { id: 'notes:1', kind: 'notes', text: 'O cliente pediu exemplos de anúncios.' };
const answer = {
  sections: [
    {
      title: 'Interesse',
      claims: [
        {
          text: 'Pediu exemplos.',
          kind: 'fact',
          citations: [{ sourceId: source.id, quote: source.text }],
        },
      ],
    },
  ],
  gaps: [],
  suggestedQuestions: [],
};
const base = {
  sources: [source],
  snapshot: { completed_at: '2026-10-18', gaps: [] },
  mode: 'briefing',
  env: {
    LLM_PROVIDER: 'superproxy',
    SUPERPROXY_MODEL: 'claude-sonnet-5-5',
    SUPERPROXY_API_KEY: 'synthetic-secret',
    GEMINI_API_KEY: 'must-not-use',
    GEMINI_MODEL: 'gemini-test',
  },
};
test('Superproxy sends server credentials only to the fixed endpoint and preserves citations/usage', async () => {
  const result = await generateAnswer({
    ...base,
    fetcher: async (url, options) => {
      assert.equal(url, 'https://branddi-super-proxy.fly.dev/v1/messages');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-secret');
      assert.equal(options.headers['anthropic-version'], '2023-06-01');
      const body = JSON.parse(options.body);
      assert.match(body.system, /DADOS NÃO CONFIÁVEIS/);
      assert.equal(body.output_config.format.schema.additionalProperties, false);
      assert.equal(body.output_config.format.type, 'json_schema');
      assert.equal(JSON.parse(body.messages[0].content).sources[0].id, source.id);
      return {
        ok: true,
        json: async () => ({
          model: 'claude-sonnet-5-5-actual',
          stop_reason: 'end_turn',
          content: [
            { type: 'thinking', thinking: 'ignored' },
            { type: 'text', text: JSON.stringify(answer) },
          ],
          usage: { input_tokens: 42 },
        }),
      };
    },
  });
  assert.equal(result.model, 'claude-sonnet-5-5-actual');
  assert.equal(result.usage.provider, 'superproxy');
  assert.equal(result.usage.input_tokens, 42);
  assert.deepEqual(result.answer, answer);
});
test('Superproxy never saves truncation, invalid JSON, or fabricated evidence', async () => {
  const fabricated = structuredClone(answer);
  fabricated.sections[0].claims[0].citations[0].quote = 'O cliente assinou o contrato.';
  for (const [stop_reason, text] of [
    ['max_tokens', JSON.stringify(answer)],
    ['end_turn', 'bad json'],
    ['end_turn', JSON.stringify(fabricated)],
  ])
    await assert.rejects(
      generateAnswer({
        ...base,
        fetcher: async () => ({
          ok: true,
          json: async () => ({ stop_reason, content: [{ type: 'text', text }] }),
        }),
      }),
      (e) => e.status === 502,
    );
});
test('Superproxy handles quota, overload, auth and timeout without leaking upstream content or falling back', async () => {
  for (const [status, expected] of [
    [429, 429],
    [529, 503],
    [503, 503],
    [401, 502],
  ]) {
    let calls = 0;
    await assert.rejects(
      generateAnswer({
        ...base,
        fetcher: async () => {
          calls++;
          return {
            ok: false,
            status,
            headers: new Headers({ 'retry-after': '90' }),
            body: { cancel: async () => {} },
            json: async () => {
              throw new Error('must not read private upstream body');
            },
          };
        },
      }),
      (e) =>
        e.status === expected &&
        !e.message.includes('synthetic-secret') &&
        (status !== 429 || e.retryAfter === 90),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    superproxyCompletion({
      fetcher: async () => {
        throw new DOMException('private upstream', 'TimeoutError');
      },
    }),
    (e) => e.status === 504,
  );
});
test('public configuration exposes no secrets and selecting Superproxy never uses Gemini credentials', async () => {
  assert.deepEqual(analysisConfiguration(base.env), {
    provider: 'superproxy',
    model: 'claude-sonnet-5-5',
    analysisConfigured: true,
  });
  const env = { ...base.env, SUPERPROXY_API_KEY: '' };
  assert.equal(analysisConfiguration(env).analysisConfigured, false);
  await assert.rejects(generateAnswer({ ...base, env }), (e) => e.code === 'configuration');
  assert.equal(
    analysisConfiguration({ ...base.env, LLM_PROVIDER: 'unknown' }).analysisConfigured,
    false,
  );
});

test('schema retains citation minimum and describes unsupported local bounds', () => {
  const schema = superproxySchema({
    type: 'array',
    minItems: 1,
    maxItems: 8,
    items: { type: 'string', minLength: 12, maxLength: 1200 },
  });
  assert.equal(schema.minItems, 1);
  assert.equal(schema.maxItems, undefined);
  assert.match(schema.description, /maxItems: 8/);
  assert.match(schema.items.description, /minLength: 12/);
  assert.match(schema.items.description, /maxLength: 1200/);
});

test('short quotes must be a complete unique structured field, never a loose value or fragment', () => {
  const fieldSource = {
    id: 'activity:1',
    kind: 'activities',
    text: 'ID: 967521\ndone: false\nsubject: Reunião com cliente',
  };
  const a = structuredClone(answer);
  a.sections[0].claims[0].citations = [{ sourceId: fieldSource.id, quote: 'done: false' }];
  assert.doesNotThrow(() => validateAnswer(a, [fieldSource]));
  for (const quote of ['false', 'done:', 'Reunião', 'done: true', ' ']) {
    a.sections[0].claims[0].citations[0].quote = quote;
    assert.throws(() => validateAnswer(a, [fieldSource]));
  }
});

test('a partially supported briefing removes the entire unsupported claim and discloses the omission', () => {
  const a = structuredClone(answer);
  a.sections[0].claims.push({
    text: 'Assinou contrato e pediu exemplos.',
    kind: 'fact',
    citations: [
      { sourceId: source.id, quote: source.text },
      { sourceId: source.id, quote: 'Contrato assinado ontem.' },
    ],
  });
  const result = validateSupportedAnswer(a, [source]);
  assert.deepEqual(result.sections[0].claims, answer.sections[0].claims);
  assert.match(result.gaps[0], /Análise parcial: 1 conclusão/);
  assert.equal(a.sections[0].claims.length, 2);
  a.sections[0].claims.shift();
  assert.throws(
    () => validateSupportedAnswer(a, [source]),
    (e) => e.code === 'invalid_evidence',
  );
  assert.throws(
    () => validateSupportedAnswer({ ...answer, unexpected: true }, [source]),
    (e) => e.code === 'invalid_answer',
  );
});
