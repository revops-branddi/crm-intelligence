import test from 'node:test';
import assert from 'node:assert/strict';
import { initialPlan, discoverTasks, advancePlan, taskKey } from '../server/extraction-plan.js';
test('paginates beyond 300 records and retains custom-field history', () => {
  let task = initialPlan({ id: 7 }).find((t) => t.kind === 'flow');
  assert.equal(task.params.all_changes, 1);
  let count = 0;
  for (let i = 0; i < 7; i++) {
    count += 100;
    const next = discoverTasks(task, {
      data: [],
      additional_data: {
        pagination: { more_items_in_collection: i < 6, next_start: (i + 1) * 100 },
      },
    });
    if (i < 6) task = next[0];
    else assert.equal(next.length, 0);
  }
  assert.equal(count, 700);
  assert.equal(task.params.start, 600);
});
test('v2 cursors advance and malformed pagination fails visibly', () => {
  const task = initialPlan({ id: 7 }).find((t) => t.kind === 'activities');
  assert.equal(
    discoverTasks(task, { data: [], additional_data: { next_cursor: 'next' } })[0].params.cursor,
    'next',
  );
  assert.throws(
    () =>
      discoverTasks(
        { ...task, params: { cursor: 'same' } },
        { additional_data: { next_cursor: 'same' } },
      ),
    /Cursor repetido/,
  );
  const flow = initialPlan({ id: 7 }).find((t) => t.kind === 'flow');
  assert.throws(
    () =>
      discoverTasks(flow, {
        additional_data: { pagination: { more_items_in_collection: true, next_start: 0 } },
      }),
    /Paginação sem avanço/,
  );
});
test('hydrates full messages, contact records, note comments and attachments', () => {
  assert.equal(
    discoverTasks({ kind: 'mailIndex' }, { data: [{ id: 9 }] })[0].params.include_body,
    1,
  );
  assert.equal(
    discoverTasks({ kind: 'participants' }, { data: [{ person_id: { value: 8 } }] })[0].path,
    '/api/v2/persons/8',
  );
  assert.equal(
    discoverTasks({ kind: 'notes' }, { data: [{ id: 3 }] })[0].path,
    '/api/v1/notes/3/comments',
  );
  assert.equal(
    discoverTasks({ kind: 'files' }, { data: [{ id: 4, name: 'proposal.pdf' }] })[0].fileId,
    4,
  );
});
test('replayed discoveries do not enqueue duplicate hydration', () => {
  const task = {
    kind: 'mail',
    path: '/api/v1/mailbox/mailMessages/9',
    params: { include_body: 1 },
  };
  const result = advancePlan(
    { pending: [{}], seen_tasks: [taskKey(task)], completed_tasks: 3 },
    { kind: 'mailIndex' },
    [task, task],
  );
  assert.equal(result.pending.length, 0);
  assert.equal(result.completed_tasks, 4);
});
