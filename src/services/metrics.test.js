import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateHardMetrics } from './metrics.js';

const deal = { data: { add_time: '2026-01-01 10:00:00' } };

test('keeps completed meetings in descending meeting-date order', () => {
  const metrics = calculateHardMetrics(deal, [
    { object: 'activity', data: { type: 'meeting', done: 1, due_date: '2026-04-06', subject: 'Reunião de abril' } },
    { object: 'activity', data: { type: 'meeting', done: true, due_date: '2026-02-01', subject: 'Reunião de fevereiro' } },
    { object: 'activity', data: { type: 'meeting', done: false, due_date: '2026-05-01', subject: 'Pendente' } },
  ]);

  assert.equal(metrics.meetingsSales, 2);
  assert.deepEqual(metrics.salesMeetings.map(meeting => meeting.subject), ['Reunião de abril', 'Reunião de fevereiro']);
  assert.equal(metrics.salesMeetings[0].date, '2026-04-06');
});
