import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './memory-db.js';
import { extractionStep, startExtraction } from '../server/extraction.js';
import { taskKey } from '../server/extraction-plan.js';
import { handleAction } from '../server/api-handler.js';
import { encryptToken } from '../server/security.js';
import { HttpError } from '../server/errors.js';
const user = { id: '11111111-1111-4111-8111-111111111111' };
const id = '22222222-2222-4222-8222-222222222222';
const deal = {
  id: 7,
  title: 'Synthetic',
  add_time: '2026-10-01',
  update_time: '2026-10-17',
  status: 'open',
};
function state(task) {
  return {
    id,
    user_id: user.id,
    company_id: 'co',
    deal_id: '7',
    title: 'Synthetic',
    status: 'collecting',
    pending: [task],
    seen_tasks: [taskKey(task)],
    completed_tasks: 0,
    gaps: [],
    lease_id: null,
  };
}
test('checkpoint is persisted before advancing, and resume reuses original after a database failure', async () => {
  const task = {
    kind: 'notes',
    path: '/api/v1/notes',
    params: { deal_id: 7, limit: 100 },
    pagination: 'offset',
  };
  const snapshot = state(task);
  const db = memoryDb({ crm_snapshots: [snapshot] });
  let calls = 0;
  const client = {
    get: async () => {
      calls++;
      return { success: true, data: [{ id: 1, content: 'Original immutable note' }] };
    },
  };
  db.fail('crm_snapshots', 'update');
  await assert.rejects(
    () => extractionStep({ db, user, snapshot, client, currentDeal: deal }),
    (error) => error.status === 503,
  );
  assert.equal(db.tables.crm_raw_pages.length, 1);
  assert.equal(db.tables.crm_snapshots[0].completed_tasks, 0);
  const result = await extractionStep({
    db,
    user,
    snapshot: db.tables.crm_snapshots[0],
    client,
    currentDeal: deal,
  });
  assert.equal(calls, 1);
  assert.equal(result.completed_tasks, 1);
  assert.equal(result.remainingTasks, 1);
  assert.equal(db.tables.crm_raw_pages[0].payload.data[0].content, 'Original immutable note');
});
test('permanent resource failure is preserved as a gap, never silently omitted', async () => {
  const task = {
    kind: 'mail',
    path: '/api/v1/mailbox/mailMessages/9',
    params: { include_body: 1 },
  };
  const snapshot = state(task);
  const db = memoryDb({ crm_snapshots: [snapshot] });
  const result = await extractionStep({
    db,
    user,
    snapshot,
    client: {
      get: async () => {
        throw new HttpError(403, 'Sem permissão.', 'pipedrive_error');
      },
    },
    currentDeal: deal,
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.gaps[0].status, 403);
  assert.equal(db.tables.crm_raw_pages[0].failure.status, 403);
});
test('rate limits keep queue intact and release lease for resumption', async () => {
  const task = { kind: 'notes', path: '/api/v1/notes', params: {} };
  const snapshot = state(task);
  const db = memoryDb({ crm_snapshots: [snapshot] });
  await assert.rejects(
    () =>
      extractionStep({
        db,
        user,
        snapshot,
        client: {
          get: async () => {
            throw new HttpError(429, 'Limite.', 'pipedrive_error', 5);
          },
        },
        currentDeal: deal,
      }),
    (error) => error.status === 429,
  );
  assert.equal(db.tables.crm_snapshots[0].pending.length, 1);
  assert.equal(db.tables.crm_snapshots[0].lease_id, null);
  assert.equal(db.tables.crm_raw_pages.length, 0);
});
test('starting a fresh extraction never overwrites or reuses an old snapshot', async () => {
  const db = memoryDb();
  const connection = { company_id: 'co' };
  const first = await startExtraction(db, user, connection, '7', deal);
  const second = await startExtraction(db, user, connection, '7', deal);
  assert.notEqual(first.id, second.id);
  assert.equal(db.tables.crm_snapshots.length, 2);
});
const env = { CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
function connectedDb(snapshot) {
  return memoryDb({
    crm_snapshots: [snapshot],
    crm_connections: [
      {
        user_id: user.id,
        company_id: 'co',
        encrypted_token: encryptToken('synthetic-token', user.id, env),
      },
    ],
  });
}
test('other user snapshots are not readable and revoked CRM access is rechecked', async () => {
  const snapshot = { ...state({}), status: 'complete', pending: [], user_id: 'another-user' };
  let calls = 0;
  await assert.rejects(
    () =>
      handleAction(
        { action: 'get', snapshotId: id },
        {
          db: connectedDb(snapshot),
          user,
          env,
          clientFactory: () => ({
            get: async () => {
              calls++;
              return { data: deal };
            },
          }),
        },
      ),
    (error) => error.status === 404,
  );
  assert.equal(calls, 0);
  snapshot.user_id = user.id;
  await assert.rejects(
    () =>
      handleAction(
        { action: 'raw', snapshotId: id, taskKey: 'a'.repeat(64) },
        {
          db: connectedDb(snapshot),
          user,
          env,
          clientFactory: () => ({
            get: async () => {
              throw new HttpError(403, 'Acesso revogado.');
            },
          }),
        },
      ),
    (error) => error.status === 403,
  );
});
test('analysis database failure propagates and never reports success', async () => {
  const snapshot = { ...state({}), status: 'complete', pending: [], completed_at: '2026-10-17' };
  const db = connectedDb(snapshot);
  db.fail('crm_answers', 'insert');
  await assert.rejects(
    () =>
      handleAction(
        { action: 'answer', snapshotId: id, mode: 'briefing', question: '' },
        {
          db,
          user,
          env,
          clientFactory: () => ({ get: async () => ({ data: deal }) }),
          generate: async () => ({
            answer: { sections: [], gaps: ['Sem contexto'], suggestedQuestions: [] },
            model: 'test',
            prompt_version: 'test',
            usage: {},
            context_manifest: {},
            elapsed_ms: 1,
          }),
        },
      ),
    (error) => error.status === 503,
  );
  assert.equal(db.tables.crm_answers.length, 0);
});

test('oversized pages shrink without skipping the cursor or recording false completion', async () => {
  const task = {
    kind: 'notes',
    path: '/api/v1/notes',
    params: { deal_id: 7, limit: 100, start: 400 },
    pagination: 'offset',
  };
  const snapshot = state(task);
  const db = memoryDb({ crm_snapshots: [snapshot] });
  const client = {
    get: async (_path, params) => {
      if (params.limit === 100) throw new HttpError(413, 'Too large', 'size_limit');
      assert.equal(params.start, 400);
      assert.equal(params.limit, 50);
      return {
        success: true,
        data: [],
        additional_data: { pagination: { more_items_in_collection: true, next_start: 450 } },
      };
    },
  };
  const resized = await extractionStep({ db, user, snapshot, client, currentDeal: deal });
  assert.equal(resized.completed_tasks, 0);
  assert.equal(resized.gaps.length, 0);
  assert.equal(db.tables.crm_raw_pages.length, 0);
  assert.equal(db.tables.crm_snapshots[0].pending[0].params.start, 400);
  assert.equal(db.tables.crm_snapshots[0].lease_id, null);
  await extractionStep({
    db,
    user,
    snapshot: db.tables.crm_snapshots[0],
    client,
    currentDeal: deal,
  });
  assert.equal(db.tables.crm_raw_pages.length, 1);
  assert.equal(db.tables.crm_snapshots[0].pending[0].params.start, 450);
});

test('large originals are transported in bounded chunks without losing Unicode or metadata', async () => {
  const snapshot = { ...state({}), status: 'complete', pending: [] };
  const db = connectedDb(snapshot);
  const page = {
    snapshot_id: id,
    task_key: 'a'.repeat(64),
    kind: 'mail',
    payload: { data: { body: '🦊 Informação original\n'.repeat(30000) } },
  };
  db.tables.crm_raw_pages = [page];
  const chunks = [];
  let offset = 0;
  do {
    const result = await handleAction(
      { action: 'raw', snapshotId: id, taskKey: page.task_key, offset },
      {
        db,
        user,
        env,
        clientFactory: () => ({ get: async () => ({ data: deal }) }),
      },
    );
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 4000000);
    chunks.push(result.rawChunk);
    offset = result.nextOffset;
  } while (offset !== null);
  assert.deepEqual(JSON.parse(chunks.join('')), page);
  assert.ok(chunks.length > 1);
});

test('bounded concurrent batch saves every original and recovers after a transient worker failure', async () => {
  const { extractionBatch } = await import('../server/extraction.js');
  const tasks = [1, 2, 3, 4].map((n) => ({
    kind: 'person',
    path: `/api/v2/persons/${n}`,
    params: {},
  }));
  const snapshot = { ...state(tasks[0]), pending: tasks, seen_tasks: tasks.map(taskKey) };
  const db = memoryDb({ crm_snapshots: [snapshot] });
  let active = 0,
    maximum = 0,
    fail = true;
  const calls = [];
  const client = {
    get: async (path) => {
      calls.push(path);
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (path.endsWith('/2') && fail) throw new HttpError(429, 'Limit', 'pipedrive_error', 5);
      return { success: true, data: { id: path.split('/').pop() } };
    },
  };
  await assert.rejects(
    () => extractionBatch({ db, user, snapshot, client, currentDeal: deal }, { concurrency: 3 }),
    (e) => e.status === 429,
  );
  assert.equal(maximum, 3);
  assert.equal(active, 0);
  assert.equal(db.tables.crm_snapshots[0].completed_tasks, 1);
  assert.equal(db.tables.crm_snapshots[0].lease_id, null);
  fail = false;
  const result = await extractionBatch({
    db,
    user,
    snapshot: db.tables.crm_snapshots[0],
    client,
    currentDeal: deal,
  });
  assert.equal(result.completed_tasks, 4);
  assert.equal(result.remainingTasks, 0);
  assert.equal(db.tables.crm_raw_pages.length, 4);
  assert.equal(calls.filter((p) => p.endsWith('/3')).length, 1);
});

test('text ready does not wait for attachments and analysis declares pending files', async () => {
  const tasks = [
    { kind: 'person', path: '/api/v2/persons/1', params: {} },
    { kind: 'attachment', path: '/api/v1/files/2/download', params: {}, fileId: 2 },
  ];
  const snapshot = { ...state(tasks[0]), pending: tasks, seen_tasks: tasks.map(taskKey) };
  const db = connectedDb(snapshot);
  const { extractionBatch } = await import('../server/extraction.js');
  let downloads = 0;
  const client = {
    get: async () => ({ success: true, data: deal }),
    download: async () => {
      downloads++;
      throw new Error('must not block core');
    },
  };
  const result = await extractionBatch({ db, user, snapshot, client, currentDeal: deal });
  assert.equal(result.analysisReady, true);
  assert.equal(result.status, 'collecting');
  assert.equal(result.pendingAttachments, 1);
  assert.equal(downloads, 0);
  await handleAction(
    { action: 'answer', snapshotId: id, mode: 'overview', question: '' },
    {
      db,
      user,
      env,
      clientFactory: () => client,
      generate: async ({ snapshot }) => {
        assert.ok(snapshot.gaps.some((gap) => gap.code === 'pending_attachments'));
        assert.ok(snapshot.completed_at);
        return { answer: {}, context_manifest: {}, model: 'test', prompt_version: 'test' };
      },
    },
  );
});
test('cached lookup remains owner and company scoped and text export retains all source content', async () => {
  const snapshot = { ...state({}), status: 'complete', pending: [] };
  const db = connectedDb(snapshot);
  db.tables.crm_snapshots.unshift({ ...snapshot, user_id: 'another-user', id: 'private' });
  const ctx = { db, user, env, clientFactory: () => ({ get: async () => ({ data: deal }) }) };
  const latest = await handleAction({ action: 'latest', dealId: '7' }, ctx);
  assert.equal(latest.snapshot.id, id);
  db.tables.crm_raw_pages = [
    {
      snapshot_id: id,
      task_key: 'a'.repeat(64),
      kind: 'notes',
      payload: { data: [{ id: 1, content: 'conteúdo original 🦊 '.repeat(20000) }] },
    },
  ];
  let offset = 0,
    text = '';
  do {
    const result = await handleAction({ action: 'text', snapshotId: id, offset }, ctx);
    text += result.text;
    offset = result.nextOffset;
  } while (offset !== null);
  assert.equal((text.match(/conteúdo original/g) || []).length, 20000);
});
