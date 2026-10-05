import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommercialHistory } from './commercial-history.js';

test('consolidates meetings, negotiations, interactions and documented non-advance reasons with sources', () => {
  const history = buildCommercialHistory(
    { data: { lost_reason: 'Sem orçamento aprovado', lost_time: '2026-05-02 09:00:00' } },
    [{ id: 10, name: 'Mariana', job_title: 'Diretora de Marketing', email: [{ value: 'mariana@empresa.com' }] }],
    [
      { object: 'activity', data: { id: 1, type: 'meeting', done: 1, due_date: '2026-04-06', subject: 'Proposta de Brand Bidding', participants: [{ person_id: 10 }] } },
      { object: 'note', data: { id: 2, add_time: '2026-04-07 10:00:00', content: '<p>Lead informou que não é prioridade agora.</p>' } },
      { object: 'mailThread', data: { id: 3, add_time: '2026-04-08 10:00:00', subject: 'Follow-up', snippet: 'Retomada comercial' } },
    ],
  );

  assert.equal(history.meetings.length, 1);
  assert.deepEqual(history.meetings[0].participants, ['Mariana']);
  assert.equal(history.negotiations.length, 1);
  assert.equal(history.interactions.length, 3);
  assert.equal(history.nonAdvanceReasons.length, 2);
  assert.match(history.nonAdvanceReasons[0].source, /motivo de perda/);
  assert.match(history.meetings[0].source, /Pipedrive/);
});
