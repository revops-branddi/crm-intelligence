import { readable } from './sources.js';
import { parsePipedriveDate } from '../src/services/metrics.js';
const value = (v) =>
  Array.isArray(v)
    ? v
        .map((item) => (typeof item === 'object' ? item.value || item.name || '' : item))
        .filter(Boolean)
        .join(', ')
    : typeof v === 'object' && v
      ? v.name || v.value || ''
      : String(v ?? '');
export function dealDetails(pages, sources, offset = 0) {
  const company = pages.find((p) => p.kind === 'organization')?.payload?.data;
  const fields = pages
    .filter((p) => p.kind === 'organizationFields')
    .flatMap((p) => p.payload?.data || []);
  const labels = new Map(fields.map((f) => [f.field_code || f.key, f.field_name || f.name]));
  const personFields = pages
    .filter((p) => p.kind === 'personFields')
    .flatMap((p) => p.payload?.data || []);
  const roleKeys = personFields
    .filter((f) => /cargo|job.title|position/i.test(f.field_name || f.name || ''))
    .map((f) => f.field_code || f.key);
  const people = [
    ...new Map(
      pages
        .filter((p) => p.kind === 'person' && p.payload?.data)
        .map((p) => {
          const person = p.payload.data;
          return [
            person.id,
            {
              id: person.id,
              name: person.name,
              email: value(person.emails || person.email),
              phone: value(person.phones || person.phone),
              role: value(
                person.job_title ||
                  roleKeys.map((k) => person.custom_fields?.[k] || person[k]).find(Boolean),
              ),
              organization: value(person.org_id || person.organization_id),
            },
          ];
        }),
    ).values(),
  ];
  const sourceIds = new Map(
    sources.filter((s) => s.kind === 'flow' && s.part === 0).map((s) => [s.recordId, s.id]),
  );
  const names = new Map(
    pages
      .filter((p) => p.kind === 'users')
      .flatMap((p) => p.payload?.data || [])
      .map((u) => [u.id, u.name]),
  );
  const types = {
    note: 'Nota',
    activity: 'Atividade',
    plannedActivity: 'Atividade planejada',
    mailMessage: 'E-mail',
    mailMessageWithAttachment: 'E-mail',
    call: 'Ligação',
  };
  const timeline = pages
    .filter((p) => p.kind === 'flow')
    .flatMap((p) => p.payload?.data || [])
    .filter((item) => types[item.object])
    .map((item) => {
      const record = item.data || {};
      return {
        id: `${item.object}:${record.id}`,
        kind: types[item.object],
        date: record.message_time || record.add_time || item.timestamp,
        title: record.subject || types[item.object],
        text: String(readable(record.content || record.note || record.snippet || '')).slice(
          0,
          1200,
        ),
        author: names.get(record.user_id || record.creator_user_id) || '',
        sourceId: sourceIds.get(String(record.id)),
      };
    })
    .sort((a, b) => (parsePipedriveDate(b.date) || 0) - (parsePipedriveDate(a.date) || 0));
  return {
    company: company
      ? {
          name: company.name,
          fields: Object.entries({ ...company, ...(company.custom_fields || {}) })
            .filter(
              ([key, v]) => key !== 'custom_fields' && v !== null && v !== undefined && value(v),
            )
            .map(([key, v]) => ({
              label:
                labels.get(key) ||
                { address: 'Endereço', website: 'Site', name: 'Nome', label: 'Segmento' }[key] ||
                key,
              value: String(readable(value(v))),
            })),
        }
      : null,
    people,
    timeline: timeline.slice(offset, offset + 30),
    totalEvents: timeline.length,
  };
}
