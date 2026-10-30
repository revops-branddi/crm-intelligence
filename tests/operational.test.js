import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './memory-db.js';
import { readSavedOperations, latestOperations } from '../server/operational-reading.js';
import { operationalPreparation } from '../server/operational-advice.js';
import { buildSources, selectContext } from '../server/sources.js';
import { preparationAction, synchronizeTasks } from '../server/preparation.js';
import { handleAction } from '../server/api-handler.js';
import { encryptToken } from '../server/security.js';
const now = Date.parse('2026-10-29T16:00:00Z');
const env = {
  OPERATIONS_COMPANY_ID: '123',
  SERP_MONITOR_READ_KEY: 'serp-secret-synthetic',
  REPORT_ENGINE_READ_KEY: 'report-secret-synthetic',
};
const snapshot = {
  id: 'snapshot',
  user_id: 'user',
  company_id: '123',
  deal_id: '17',
  title: 'Marca sintética | Brand Bidding',
  started_at: '2026-10-29T12:00:00Z',
};
const identity = {
  company_id: '123',
  deal_id: 17,
  org_id: 9,
  read_at: new Date(now).toISOString(),
};
const campaign = {
  id: 'c1',
  company_id: 'co1',
  created_at: new Date(now - 86400000).toISOString(),
  updated_at: null,
  expires_at: null,
  is_active: false,
  status: 'completed',
  queued_tasks: 0,
  spreadsheet_attached_at: null,
  configuration: {
    keywords: ['marca'],
    cities: ['São Paulo'],
    devices: ['desktop'],
    search_engines: ['google'],
    own_domains: ['marca.test'],
    daily_requests_limit: 50,
  },
  executions: [
    {
      id: 'e1',
      status: 'completed',
      started_at: new Date(now - 3600000).toISOString(),
      finished_at: new Date(now - 1000).toISOString(),
      total_tasks: 20,
      completed_tasks: 20,
      error_tasks: 0,
      planned_tasks: 20,
      queue_completed_tasks: 20,
      terminal_queue_failures: 0,
      tasks_with_ads: 0,
      num_competitors: null,
    },
  ],
};
function fixtures() {
  return {
    monitoring: {
      ...identity,
      version: 'crm-monitoring-v1',
      source: 'serp-monitor',
      state: 'complete',
      coverage: { campaigns_complete: true, executions_complete: true, queue_complete: true },
      field_issues: [],
      campaigns: [structuredClone(campaign)],
    },
    reports: {
      ...identity,
      version: 'crm-reports-v1',
      source: 'report-engine',
      products: ['bb', 'bbp', 'gd'].map((product) => ({
        product,
        scope: 'exact_deal_or_canonical_crm_link',
        linked_in_crm: false,
        state: 'not_found',
        reports: [],
      })),
    },
  };
}
function setup() {
  const f = fixtures(),
    db = memoryDb(),
    pages = [
      {
        kind: 'deal',
        task_key: 'd'.repeat(64),
        payload: { data: { id: 17, org_id: 9, title: snapshot.title } },
      },
    ],
    calls = [];
  const options = {
    env,
    now,
    currentDeal: { id: 17, org_id: 9, owner_id: 4 },
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(String(url).includes('/monitoring') ? f.monitoring : f.reports);
    },
  };
  return { f, db, pages, calls, options };
}
test('all deals use exact identity GETs, dedicated headers, bounded timeout and persisted secret-free evidence', async () => {
  for (const dealId of [17, 804, 99031]) {
    const c = setup();
    c.options.currentDeal.id = dealId;
    c.pages[0].payload.data.id = dealId;
    c.f.monitoring.deal_id = c.f.reports.deal_id = dealId;
    const result = await readSavedOperations(
      c.db,
      { ...snapshot, deal_id: String(dealId) },
      c.pages,
      c.options,
    );
    assert.ok(result.every((r) => r.status === 'read'));
    assert.equal(c.calls.length, 2);
    for (const call of c.calls) {
      assert.equal(new URL(call.url).searchParams.get('deal_id'), String(dealId));
      assert.equal(call.init.method, 'GET');
      assert.equal(call.init.redirect, 'error');
      assert.ok(call.init.signal instanceof AbortSignal);
    }
    assert.doesNotMatch(JSON.stringify(c.db.tables), /secret-synthetic|Authorization/);
    await readSavedOperations(c.db, { ...snapshot, deal_id: String(dealId) }, c.pages, c.options);
    assert.equal(c.calls.length, 2, 'cached observations do not re-query or rewrite');
  }
});
test('foreign tenant, changed organization and absent organization fail closed without external calls', async () => {
  for (const change of [
    (c) => {
      c.options.env = { ...env, OPERATIONS_COMPANY_ID: '999' };
    },
    (c) => {
      c.options.currentDeal.org_id = 8;
    },
    (c) => {
      c.options.currentDeal.org_id = null;
    },
  ]) {
    const c = setup();
    change(c);
    const result = await readSavedOperations(c.db, snapshot, c.pages, c.options);
    assert.equal(c.calls.length, 0);
    assert.ok(result.every((r) => r.status !== 'read' && r.facts === null));
  }
});

test('JSONB key reordering preserves cache and approvals for unchanged evidence', async () => {
  const c = setup();
  await readSavedOperations(c.db, snapshot, c.pages, c.options);
  const before = operationalPreparation(c.pages, buildSources(c.pages), snapshot, null, now);
  const reordered = JSON.parse(
    JSON.stringify(c.pages, (_key, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ),
  );
  await readSavedOperations(c.db, snapshot, reordered, c.options);
  assert.equal(c.calls.length, 2);
  const after = operationalPreparation(reordered, buildSources(reordered), snapshot, null, now);
  assert.deepEqual(
    after.items.map((i) => i.fingerprint),
    before.items.map((i) => i.fingerprint),
  );
});
test('one failed source does not hide the other, and a stale previous success never becomes current evidence', async () => {
  const c = setup();
  await readSavedOperations(c.db, snapshot, c.pages, c.options);
  const later = now + 121000;
  c.f.reports.read_at = new Date(later).toISOString();
  await readSavedOperations(c.db, snapshot, c.pages, {
    ...c.options,
    now: later,
    fetcher: async (url) =>
      String(url).includes('/monitoring')
        ? new Response('provider secret', { status: 503 })
        : Response.json(c.f.reports),
  });
  assert.equal(c.pages.filter((p) => p.kind === 'operational').length, 4);
  const sources = selectContext(buildSources(c.pages), 'monitoria relatório', 100000, 5).sources;
  assert.match(
    sources
      .filter((s) => s.operationalKey === 'serp')
      .map((s) => s.text)
      .join(''),
    /Consulta indisponível/,
  );
  assert.doesNotMatch(
    sources
      .filter((s) => s.operationalKey === 'serp')
      .map((s) => s.text)
      .join(''),
    /Campanha c1/,
  );
  assert.equal(
    latestOperations(c.pages).find((p) => p.payload.data.id === 'reports').payload.data.status,
    'read',
  );
});
test('malformed, oversized, stale or mismatched responses cannot become facts', async () => {
  for (const response of [
    Response.json({}),
    Response.json({ ...fixtures().monitoring, org_id: 999 }),
    Response.json({ ...fixtures().monitoring, read_at: '2025-01-01T00:00:00Z' }),
    new Response('x'.repeat(750001)),
    new Response('secret upstream exception', { status: 500 }),
  ]) {
    const c = setup();
    const result = await readSavedOperations(c.db, snapshot, c.pages, {
      ...c.options,
      fetcher: async (url) =>
        String(url).includes('/monitoring') ? response : Response.json(c.f.reports),
    });
    assert.equal(result.find((r) => r.id === 'serp').facts, null);
    assert.equal(result.find((r) => r.id === 'reports').status, 'read');
    assert.doesNotMatch(JSON.stringify(c.pages), /secret upstream/);
  }
});
test('low yield, failures, waiting and unknown coverage lead to distinct recommendations', async () => {
  for (const [change, id, kind] of [
    [() => {}, 'scope', 'recommendation'],
    [
      (f) => {
        f.monitoring.campaigns[0].queued_tasks = 4;
      },
      'waiting',
      'task',
    ],
    [
      (f) => {
        f.monitoring.campaigns[0].executions[0].terminal_queue_failures = 3;
      },
      'failure',
      'issue',
    ],
    [
      (f) => {
        f.monitoring.campaigns[0].executions[0].planned_tasks = null;
      },
      'coverage',
      'task',
    ],
  ]) {
    const c = setup();
    change(c.f);
    await readSavedOperations(c.db, snapshot, c.pages, c.options);
    const result = operationalPreparation(c.pages, buildSources(c.pages), snapshot, null, now);
    const item = result.items.find((i) => i.id === `operation:serp:${id}`);
    assert.equal(item.kind, kind);
    assert.ok(item.citations.some((ref) => /Execução e1|Campanha c1/.test(ref.quote)));
    assert.ok(item.citations.every((ref) => ref.quote !== 'Consulta: Consultado'));
    assert.ok(
      !result.items.some((i) => /bbp|gd/.test(i.id)),
      'do not demand unrelated product reports',
    );
  }
});
test('a ready report without canonical link recommends linking, never regenerating', async () => {
  const c = setup();
  c.f.reports.products[0] = {
    ...c.f.reports.products[0],
    state: 'found',
    reports: [
      {
        slug: 'marca',
        status: 'completed',
        url: 'https://report.branddi.com/report/marca',
        linked_in_crm: false,
        generated_at: identity.read_at,
        advertisers_count: 0,
      },
    ],
  };
  await readSavedOperations(c.db, snapshot, c.pages, c.options);
  const items = operationalPreparation(c.pages, buildSources(c.pages), snapshot, null, now).items;
  assert.ok(items.some((i) => i.id === 'operation:reports:bb:link'));
  assert.ok(!items.some((i) => /reports:bb:missing/.test(i.id)));
});
test('approval is individual, persists, and is invalidated by changed evidence or scope', async () => {
  const c = setup();
  await readSavedOperations(c.db, snapshot, c.pages, c.options);
  const ctx = {
    db: c.db,
    user: { id: 'user', email: 'test@example.test' },
    snapshot,
    pages: c.pages,
    sources: buildSources(c.pages),
    currentDeal: c.options.currentDeal,
    client: { get: async () => ({ data: [{ id: 4, name: 'SDR' }] }) },
  };
  let data = await preparationAction({ action: 'preparation' }, ctx);
  const id = 'operation:serp:scope';
  await assert.rejects(
    () =>
      preparationAction(
        {
          action: 'savePreparationTask',
          revision: data.revision,
          taskId: id,
          assigneeId: '4',
          status: 'open',
          note: '',
          approveRecommendation: true,
        },
        ctx,
      ),
    /justificativa/,
  );
  data = await preparationAction(
    {
      action: 'savePreparationTask',
      revision: data.revision,
      taskId: id,
      assigneeId: '4',
      status: 'open',
      note: 'Conferi o escopo e os termos de marca.',
      approveRecommendation: true,
    },
    ctx,
  );
  assert.ok(data.tasks.find((t) => t.id === id).recommendationApproval);
  assert.ok(
    data.tasks.filter((t) => t.id !== id).every((t) => !t.recommendationApproval && !t.approval),
  );
  const old = Object.fromEntries(data.tasks.map((t) => [t.id, t]));
  const operations = operationalPreparation(
    c.pages,
    ctx.sources,
    snapshot,
    {
      kind: 'brand',
      brands: ['Outra marca'],
      domains: ['outra.test'],
      product: 'BB',
      maxAgeDays: 30,
    },
    now,
  );
  const updated = synchronizeTasks(old, operations.items);
  assert.equal(updated[id].recommendationApproval, null);
  assert.equal(updated[id].status, 'open');
  assert.deepEqual(Object.keys(c.db.tables).sort(), [
    'crm_answers',
    'crm_preparation_workflows',
    'crm_raw_pages',
  ]);
});

test('answer action rechecks CRM visibility and automatically collects both providers before model input', async () => {
  const c = setup(),
    user = { id: 'user' };
  const appEnv = { ...env, CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
  c.db.tables.crm_connections = [
    {
      user_id: user.id,
      company_id: '123',
      encrypted_token: encryptToken('synthetic-crm-token', user.id, appEnv),
    },
  ];
  c.db.tables.crm_snapshots = [
    {
      ...snapshot,
      status: 'complete',
      pending: [],
      gaps: [],
      completed_at: new Date().toISOString(),
    },
  ];
  c.db.tables.crm_raw_pages = c.pages.map((page) => ({ ...page, snapshot_id: snapshot.id }));
  let modelCalls = 0;
  const context = {
    db: c.db,
    user,
    env: appEnv,
    clientFactory: () => ({ get: async () => ({ data: c.options.currentDeal }) }),
    operationalFetcher: async (url) => {
      const body = structuredClone(
        String(url).includes('/monitoring') ? c.f.monitoring : c.f.reports,
      );
      body.read_at = new Date().toISOString();
      return Response.json(body);
    },
    generate: async ({ sources }) => {
      modelCalls++;
      assert.ok(sources.some((s) => s.operationalKey === 'serp' && /Campanha c1/.test(s.text)));
      assert.ok(sources.some((s) => s.operationalKey === 'reports'));
      return { answer: {}, model: 'synthetic' };
    },
  };
  const input = { action: 'answer', snapshotId: snapshot.id, mode: 'overview', question: '' };
  await handleAction(input, context);
  assert.equal(modelCalls, 1);
  await assert.rejects(
    () =>
      handleAction(input, {
        ...context,
        clientFactory: () => ({ get: async () => ({ data: null }) }),
        operationalFetcher: async () => {
          throw new Error('must not query after access revoked');
        },
      }),
    (error) => error.status === 403,
  );
  assert.equal(modelCalls, 1);
});
