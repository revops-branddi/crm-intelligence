import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCampaigns, reportKeywords } from '../src/services/report-evidence.js';
const now = Date.parse('2026-10-30T12:00:00Z');
const campaign = (id, days, patch = {}) => ({
  id,
  queued_tasks: 0,
  configuration: { keywords: ['marca', id] },
  executions: [
    {
      status: 'completed',
      finished_at: new Date(now - days * 86400000).toISOString(),
      planned_tasks: 10,
      queue_completed_tasks: 10,
      terminal_queue_failures: 0,
    },
  ],
  ...patch,
});
test('report suggestions combine only completed evidence within the selected window, never creation time or pending captures', () => {
  const a = campaign('a', 1),
    b = campaign('b', 29),
    old = campaign('old', 31);
  const pending = campaign('pending', 1, { queued_tasks: 2 });
  const missing = campaign('missing', 1);
  delete missing.executions[0].finished_at;
  const incomplete = campaign('incomplete', 1);
  incomplete.executions[0].queue_completed_tasks = 8;
  const future = campaign('future', -1);
  const items = [pending, old, a, b, missing, incomplete, future];
  assert.deepEqual(
    reportCampaigns(items, 30, now).map((c) => c.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    reportCampaigns(items, 7, now).map((c) => c.id),
    ['a'],
  );
  assert.deepEqual(reportKeywords(reportCampaigns(items, 30, now)), ['marca', 'a', 'b']);
});
