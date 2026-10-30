import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './memory-db.js';
import { projectAction, validateParameters, executionProof } from '../server/project-execution.js';
const identity = { company_id: '123', deal_id: 17, org_id: 9 };
const campaign = {
  id: 'c1',
  company_id: 'co1',
  created_at: null,
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
    daily_requests_limit: 30,
  },
  executions: [],
};
const scope = {
  brands: ['Marca'],
  domains: ['marca.test'],
  organizationId: '9',
  confirmedAt: '2026-10-30T12:00:00Z',
};
const parameters = {
  system: 'serp',
  brand: 'Marca',
  domains: ['marca.test'],
  keywords: ['marca'],
  cities: ['São Paulo'],
  devices: ['desktop'],
  rounds: 1,
  windowHours: 1,
  maxRequests: 3,
  allowStageException: false,
};
function setup() {
  const user = { id: 'u', email: 'actor@example.test' },
    snapshot = { id: 's', company_id: '123', deal_id: '17' };
  const db = memoryDb({
    crm_preparation_workflows: [
      { user_id: 'u', company_id: '123', deal_id: '17', state: { scope } },
    ],
  });
  const data = {
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
        linked_in_crm: false,
        scope: 'exact',
        state: 'not_found',
        reports: [],
      })),
    },
  };
  const calls = [],
    ctx = {
      db,
      user,
      snapshot,
      pages: [{ kind: 'deal', payload: { data: { id: 17, org_id: 9 } } }],
      currentDeal: { id: 17, org_id: 9, stage_id: 403, pipeline_id: 29 },
      env: {
        OPERATIONS_COMPANY_ID: '123',
        SERP_MONITOR_READ_KEY: 'read-s',
        REPORT_ENGINE_READ_KEY: 'read-r',
        SERP_MONITOR_EXECUTE_KEY: 'write-s',
        REPORT_ENGINE_EXECUTE_KEY: 'write-r',
      },
      client: { get: async () => ({ data: [{ id: 4, name: 'SDR', active_flag: true }] }) },
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init });
        if (init?.method === 'POST') {
          const c = JSON.parse(init.body);
          return Response.json({ id: c.id, status: 'running' });
        }
        if (String(url).includes('/executions'))
          return Response.json({ id: new URL(url).searchParams.get('id'), status: 'completed' });
        const record = String(url).includes('/monitoring') ? data.monitoring : data.reports;
        return Response.json({ ...record, read_at: new Date().toISOString() });
      },
    };
  return {
    ctx,
    data,
    calls,
    prepare: () =>
      projectAction(
        {
          action: 'prepareProjectAction',
          parameters,
          assigneeId: '4',
          reason: 'Conferir a cobertura da marca',
        },
        ctx,
      ),
  };
}
test('review is inert, approval freezes exact command and repeated clicks dispatch only once', async () => {
  const c = setup(),
    p = await c.prepare();
  assert.equal(p.execution.status, 'draft');
  assert.equal(c.calls.filter((c) => c.init?.method === 'POST').length, 0);
  assert.equal(p.execution.command, undefined);
  const args = { action: 'approveProjectAction', executionId: p.execution.id };
  const r = await projectAction(args, c.ctx);
  assert.equal(r.execution.status, 'running');
  await projectAction(args, c.ctx);
  const posts = c.calls.filter((c) => c.init?.method === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(JSON.parse(posts[0].init.body).actor, c.ctx.user.email);
  assert.equal(JSON.parse(posts[0].init.body).maxRequests, 3);
  const done = await projectAction(
    { action: 'projectExecution', executionId: p.execution.id },
    c.ctx,
  );
  assert.equal(done.execution.status, 'completed');
  assert.equal(c.calls.filter((c) => c.init?.method === 'POST').length, 1);
});
test('changed evidence, identity and responsible person revoke approval before dispatch', async () => {
  for (const kind of ['source', 'org', 'owner']) {
    const c = setup(),
      p = await c.prepare();
    if (kind === 'source') c.data.monitoring.campaigns[0].configuration.keywords = ['other'];
    if (kind === 'org') c.ctx.currentDeal.org_id = 99;
    if (kind === 'owner') c.ctx.client.get = async () => ({ data: [] });
    await assert.rejects(() =>
      projectAction({ action: 'approveProjectAction', executionId: p.execution.id }, c.ctx),
    );
    assert.equal(c.calls.filter((c) => c.init?.method === 'POST').length, 0);
  }
});
test('ambiguous dispatch remains uncertain; reopening or reapproving never posts again', async () => {
  const c = setup(),
    p = await c.prepare(),
    f = c.ctx.fetcher;
  c.ctx.fetcher = async (u, i) => {
    if (i?.method === 'POST') {
      c.calls.push({ url: String(u), init: i });
      throw new Error('timeout');
    }
    return f(u, i);
  };
  const args = { action: 'approveProjectAction', executionId: p.execution.id };
  assert.equal((await projectAction(args, c.ctx)).execution.status, 'uncertain');
  await projectAction(args, c.ctx);
  assert.equal(c.calls.filter((c) => c.init?.method === 'POST').length, 1);
});
test('persisting the approval must succeed before any command; ownership is enforced', async () => {
  const c = setup(),
    p = await c.prepare();
  c.ctx.db.fail('crm_project_executions', 'update');
  await assert.rejects(() =>
    projectAction({ action: 'approveProjectAction', executionId: p.execution.id }, c.ctx),
  );
  assert.equal(c.calls.filter((c) => c.init?.method === 'POST').length, 0);
  c.ctx.user = { id: 'other' };
  await assert.rejects(() =>
    projectAction({ action: 'approveProjectAction', executionId: p.execution.id }, c.ctx),
  );
});
test('scope, ceiling, ongoing capture, report terms and clock semantics are validated', () => {
  const ops = {
    serp: { status: 'read', facts: { state: 'complete', campaigns: [campaign] } },
    reports: {
      status: 'read',
      facts: {
        products: [{ product: 'bb', state: 'not_found', linked_in_crm: false, reports: [] }],
      },
    },
  };
  assert.throws(() => validateParameters({ ...parameters, maxRequests: 0 }, scope, ops));
  assert.throws(() => validateParameters(parameters, null, ops));
  assert.throws(() => validateParameters({ ...parameters, domains: ['foreign.test'] }, scope, ops));
  const p = {
    system: 'reports',
    brand: 'Marca',
    domain: 'marca.test',
    mode: 'generate',
    slug: 'crm-17-bb',
    campaignIds: ['c1'],
    keywords: ['wrong'],
  };
  assert.throws(() => validateParameters(p, scope, ops));
  ops.reports.facts.products[0] = {
    product: 'bb',
    state: 'found',
    linked_in_crm: true,
    reports: [{ slug: p.slug, brand: 'Outra marca', domain: p.domain }],
  };
  assert.throws(
    () =>
      validateParameters(
        { ...p, mode: 'regenerate', keywords: campaign.configuration.keywords },
        scope,
        ops,
      ),
    /corresponder/,
  );
  const a = executionProof(ops, scope, { org_id: 9 }, 'reports');
  ops.serp.facts.read_at = 'later';
  assert.equal(executionProof(ops, scope, { org_id: 9 }, 'reports'), a);
});
test('report selection can combine campaign-specific keywords without admitting foreign terms', () => {
  const ops = {
    serp: {
      status: 'read',
      facts: {
        state: 'complete',
        campaigns: [
          campaign,
          {
            ...campaign,
            id: 'c2',
            configuration: { ...campaign.configuration, keywords: ['marca promoção'] },
          },
        ],
      },
    },
    reports: {
      status: 'read',
      facts: { products: [{ product: 'bb', state: 'not_found', reports: [] }] },
    },
  };
  const p = {
    system: 'reports',
    brand: 'Marca',
    domain: 'marca.test',
    mode: 'generate',
    slug: 'crm-17-bb',
    campaignIds: ['c1', 'c2'],
    keywords: ['marca', 'marca promoção'],
  };
  assert.doesNotThrow(() => validateParameters(p, scope, ops));
  assert.throws(() => validateParameters({ ...p, keywords: ['outra marca'] }, scope, ops));
  ops.serp.facts.campaigns[1].queued_tasks = 1;
  assert.throws(() => validateParameters(p, scope, ops));
});

test('refreshed queue observation clock never invalidates approval; material queue changes still do', () => {
  const ops = {
    serp: {
      facts: {
        state: 'complete',
        coverage: { queue_complete: true },
        campaigns: [
          {
            ...campaign,
            queue_detail: {
              observed_at: '2026-10-30T12:00:00Z',
              ready_tasks: 0,
              processing_tasks: 0,
              tasks_ahead: 10,
            },
          },
        ],
      },
    },
  };
  const current = { org_id: 9, stage_id: 403, pipeline_id: 29 };
  const proof = executionProof(ops, scope, current, 'serp');
  ops.serp.facts.campaigns[0].queue_detail.observed_at = '2026-10-30T12:01:00Z';
  ops.serp.facts.campaigns[0].queue_detail.tasks_ahead = 5;
  assert.equal(executionProof(ops, scope, current, 'serp'), proof);
  ops.serp.facts.campaigns[0].queue_detail.ready_tasks = 1;
  assert.notEqual(executionProof(ops, scope, current, 'serp'), proof);
});
test('existing queue priority requires individual approval and uses its own endpoint exactly once', async () => {
  const c = setup();
  c.data.monitoring.campaigns[0].queued_tasks = 162;
  c.data.monitoring.campaigns[0].queue_detail = {
    observed_at: new Date().toISOString(),
    ready_tasks: 162,
    eligible_ready_tasks: 162,
    tasks_ahead: 80,
    scheduled_tasks: 0,
    processing_tasks: 0,
    stale_processing_tasks: 0,
    unknown_schedule_tasks: 0,
    next_scheduled_at: null,
    oldest_ready_at: '2026-10-30T10:00:00Z',
    last_updated_at: null,
  };
  const params = {
    system: 'serp',
    action: 'prioritize',
    campaignId: 'c1',
    brand: 'Marca',
    domains: ['marca.test'],
    expectedReadyTasks: 162,
  };
  const p = await projectAction(
    {
      action: 'prepareProjectAction',
      parameters: params,
      assigneeId: '4',
      reason: 'Concluir coleta existente',
    },
    c.ctx,
  );
  assert.equal(c.calls.filter((c) => c.init?.method === 'POST').length, 0);
  c.data.monitoring.campaigns[0].queue_detail.observed_at = new Date(
    Date.now() + 1000,
  ).toISOString();
  await projectAction({ action: 'approveProjectAction', executionId: p.execution.id }, c.ctx);
  await projectAction({ action: 'approveProjectAction', executionId: p.execution.id }, c.ctx);
  const posts = c.calls.filter((c) => c.init?.method === 'POST');
  assert.equal(posts.length, 1);
  assert.match(posts[0].url, /\/queue-priority$/);
  assert.equal(JSON.parse(posts[0].init.body).expectedReadyTasks, 162);
  assert.equal(JSON.parse(posts[0].init.body).actor, c.ctx.user.email);
  const ops = { serp: { status: 'read', facts: c.data.monitoring } };
  assert.throws(() => validateParameters(parameters, scope, ops), /Aguarde/);
  assert.throws(
    () => validateParameters({ ...params, campaignId: 'foreign' }, scope, ops),
    /Atualize/,
  );
  assert.throws(
    () => validateParameters({ ...params, expectedReadyTasks: 163 }, scope, ops),
    /Atualize/,
  );
});
