import test from 'node:test';
import assert from 'node:assert/strict';
import { dealDetails } from '../server/deal-details.js';
import { buildSources } from '../server/sources.js';
test('all recorded people and chronological events remain independently readable without AI', () => {
  const pages = [
    {
      kind: 'organization',
      task_key: 'a'.repeat(64),
      payload: { data: { id: 1, name: 'Company', custom_fields: { segment: 'Retail' } } },
    },
    {
      kind: 'organizationFields',
      task_key: 'b'.repeat(64),
      payload: { data: [{ field_code: 'segment', field_name: 'Segmento' }] },
    },
    ...Array.from({ length: 38 }, (_, i) => ({
      kind: 'person',
      task_key: String(i).padStart(64, '0'),
      payload: {
        data: { id: i + 1, name: `Person ${i}`, emails: [{ value: `person${i}@example.test` }] },
      },
    })),
    {
      kind: 'flow',
      task_key: 'c'.repeat(64),
      payload: {
        data: Array.from({ length: 301 }, (_, i) => ({
          object: 'note',
          timestamp: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
          data: { id: i + 1, content: `<p>Original note ${i}</p>` },
        })),
      },
    },
  ];
  const sources = buildSources(pages);
  const first = dealDetails(pages, sources);
  assert.equal(first.people.length, 38);
  assert.equal(first.people[0].email, 'person0@example.test');
  assert.equal(first.company.fields.find((f) => f.label === 'Segmento').value, 'Retail');
  assert.equal(first.totalEvents, 301);
  assert.equal(first.timeline.length, 30);
  assert.equal(first.timeline[0].text, 'Original note 300');
  assert.ok(sources.some((s) => s.id === first.timeline[0].sourceId));
  assert.equal(dealDetails(pages, sources, 300).timeline.length, 1);
});
