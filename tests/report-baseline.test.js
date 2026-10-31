import test from 'node:test';
import assert from 'node:assert/strict';
import { reportBaseline } from '../src/services/report-baseline.js';
const now = Date.parse('2026-10-31T12:00:00Z');
test('baseline distinguishes missing counters from zero and tracks freshness boundary', () => {
  assert.equal(reportBaseline(null, 30, now).exists, false);
  assert.equal(reportBaseline({ generated_at: 'invalid' }, 30, now).advertisers, null);
  assert.equal(reportBaseline({ generated_at: 'invalid' }, 30, now).expired, true);
  const report = { advertisers_count: 0, generated_at: '2026-10-01T12:00:00Z' };
  assert.equal(reportBaseline(report, 30, now).advertisers, 0);
  assert.equal(reportBaseline(report, 30, now).expired, false);
  assert.equal(reportBaseline(report, 29, now).expired, true);
  const saved = reportBaseline(report, 30, now);
  report.advertisers_count = 9;
  assert.equal(saved.advertisers, 0);
});
