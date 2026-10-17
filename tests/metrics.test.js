import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHardMetrics, parsePipedriveDate } from '../src/services/metrics.js';
const now = Date.parse('2026-10-17T12:00:00Z');
const deal = { data: { add_time: '2026-09-01 12:00:00', status: 'open' } };
test('pending future contact does not reset inactivity or count as completed', () => {
  const metrics = calculateHardMetrics(
    deal,
    [
      {
        object: 'activity',
        data: {
          id: 1,
          type: 'call',
          done: false,
          add_time: '2026-10-17 10:00:00',
          due_date: '2026-10-20',
        },
      },
    ],
    now,
  );
  assert.equal(metrics.daysInactive, null);
  assert.equal(metrics.totalActions, 0);
  assert.equal(metrics.pendingActivities, 1);
});
test('completed meeting counts as contact on occurrence date, not creation date', () => {
  const metrics = calculateHardMetrics(
    deal,
    [
      {
        object: 'activity',
        data: {
          id: 1,
          type: 'reuniao_01',
          done: 1,
          add_time: '2026-09-01 12:00:00',
          due_date: '2026-10-16',
          due_time: '12:00:00',
        },
      },
    ],
    now,
  );
  assert.equal(metrics.daysInactive, 1);
  assert.equal(metrics.meetingsOutbound, 1);
});
test('supports ISO, offset, legacy UTC and date-only timestamps', () => {
  assert.equal(parsePipedriveDate('2026-10-17T12:00:00Z'), now);
  assert.equal(parsePipedriveDate('2026-10-17T09:00:00-03:00'), now);
  assert.equal(parsePipedriveDate('2026-10-17 12:00:00'), now);
  assert.ok(parsePipedriveDate('2026-10-17'));
  assert.equal(parsePipedriveDate('invalid'), null);
});
test('closed deal stops aging and duplicated activities count once', () => {
  const event = {
    object: 'activity',
    data: { id: 1, type: 'call', done: true, due_date: '2026-10-10' },
  };
  const metrics = calculateHardMetrics(
    { data: { ...deal.data, status: 'won', won_time: '2026-09-11 12:00:00' } },
    [event, event],
    now,
  );
  assert.equal(metrics.daysOpen, 10);
  assert.equal(metrics.totalActions, 1);
});

test('mail variants count once and completed activities dated in the future are excluded', () => {
  const mail = { id: 4, message_time: '2026-10-16T12:00:00Z' };
  const metrics = calculateHardMetrics(
    deal,
    [
      { object: 'mailMessageWithAttachment', data: mail },
      { object: 'mailMessage', data: mail },
      { object: 'activity', data: { id: 5, type: 'meeting', done: true, due_date: '2026-11-01' } },
    ],
    now,
  );
  assert.equal(metrics.totalActions, 1);
  assert.equal(metrics.meetingsSales, 0);
  assert.equal(metrics.daysInactive, 1);
});
