import { createHash } from 'node:crypto';
import { idOf } from './pipedrive.js';
import { HttpError } from './errors.js';
export const taskKey = (task) =>
  createHash('sha256')
    .update(JSON.stringify([task.kind, task.path, task.params || {}, task.fileId || null]))
    .digest('hex');
function list(kind, path, params = {}, pagination = 'offset') {
  return { kind, path, params: { limit: 100, ...params }, pagination };
}
function single(kind, path) {
  return { kind, path, params: {} };
}
export function initialPlan(deal) {
  const id = deal.id;
  const tasks = [
    list('flow', `/api/v1/deals/${id}/flow`, { all_changes: 1 }),
    list('notes', '/api/v1/notes', { deal_id: id }),
    list('activities', '/api/v2/activities', { deal_id: id }, 'cursor'),
    list('participants', `/api/v1/deals/${id}/participants`),
    list('mailIndex', `/api/v1/deals/${id}/mailMessages`),
    list('files', `/api/v1/deals/${id}/files`),
    list('products', `/api/v2/deals/${id}/products`, {}, 'cursor'),
    list('changelog', `/api/v1/deals/${id}/changelog`, {}, 'cursor'),
    list('participantChanges', `/api/v1/deals/${id}/participantsChangelog`),
    list('followers', `/api/v2/deals/${id}/followers`, {}, 'cursor'),
    list('dealFields', '/api/v2/dealFields', {}, 'cursor'),
    list('personFields', '/api/v2/personFields', {}, 'cursor'),
    list('organizationFields', '/api/v2/organizationFields', {}, 'cursor'),
    single('users', '/api/v1/users'),
    single('activityTypes', '/api/v1/activityTypes'),
  ];
  if (idOf(deal.org_id))
    tasks.push(single('organization', `/api/v2/organizations/${idOf(deal.org_id)}`));
  if (idOf(deal.person_id)) tasks.push(single('person', `/api/v2/persons/${idOf(deal.person_id)}`));
  return tasks;
}
export function discoverTasks(task, body) {
  const tasks = [];
  const records = Array.isArray(body.data) ? body.data : [];
  if (task.pagination === 'offset' && body.additional_data?.pagination?.more_items_in_collection) {
    const next = body.additional_data.pagination.next_start;
    if (!Number.isFinite(next) || next <= Number(task.params.start || 0))
      throw new HttpError(
        502,
        'Paginação sem avanço; coleta interrompida para evitar perda de registros.',
        'invalid_pagination',
      );
    tasks.push({ ...task, params: { ...task.params, start: next } });
  }
  if (task.pagination === 'cursor' && body.additional_data?.next_cursor) {
    const cursor = body.additional_data.next_cursor;
    if (cursor === task.params.cursor)
      throw new HttpError(502, 'Cursor repetido; coleta interrompida.', 'invalid_pagination');
    tasks.push({ ...task, params: { ...task.params, cursor } });
  }
  if (task.kind === 'participants')
    for (const record of records) {
      const id = idOf(record.person_id) || record.person?.id;
      if (id) tasks.push(single('person', `/api/v2/persons/${id}`));
    }
  if (task.kind === 'mailIndex')
    for (const record of records)
      if (record.id)
        tasks.push({
          kind: 'mail',
          path: `/api/v1/mailbox/mailMessages/${record.id}`,
          params: { include_body: 1 },
        });
  if (task.kind === 'mail')
    for (const file of body.data?.attachments || [])
      if (file.id)
        tasks.push({
          kind: 'attachment',
          fileId: file.id,
          name: file.file_name || file.name || String(file.id),
          path: `/api/v1/files/${file.id}/download`,
          params: {},
        });
  if (task.kind === 'notes')
    for (const record of records)
      if (record.id) tasks.push(list('comments', `/api/v1/notes/${record.id}/comments`));
  if (task.kind === 'files')
    for (const record of records)
      if (record.id)
        tasks.push({
          kind: 'attachment',
          fileId: record.id,
          name: record.file_name || record.name || String(record.id),
          path: `/api/v1/files/${record.id}/download`,
          params: {},
        });
  // Flow can reference emails, notes and files absent from an index page; deduplicate by task key.
  if (task.kind === 'flow')
    for (const record of records) {
      const id = record.data?.id;
      if (!id) continue;
      if (['mailMessage', 'mailMessageWithAttachment'].includes(record.object))
        tasks.push({
          kind: 'mail',
          path: `/api/v1/mailbox/mailMessages/${id}`,
          params: { include_body: 1 },
        });
      if (record.object === 'file')
        tasks.push({
          kind: 'attachment',
          fileId: id,
          name: record.data.file_name || record.data.name || String(id),
          path: `/api/v1/files/${id}/download`,
          params: {},
        });
    }
  return tasks;
}
export function advancePlan(snapshot, task, discovered) {
  const known = new Set(snapshot.seen_tasks);
  const pending = snapshot.pending.slice(1);
  for (const next of discovered) {
    const key = taskKey(next);
    if (known.has(key) && next.pagination && next.kind === task.kind && next.path === task.path)
      throw new HttpError(
        502,
        'Ciclo de paginação detectado; coleta incompleta.',
        'invalid_pagination',
      );
    if (!known.has(key)) {
      known.add(key);
      pending.push(next);
    }
  }
  return {
    pending,
    seen_tasks: [...known],
    completed_tasks: snapshot.completed_tasks + 1,
    last_resource: task.kind,
  };
}
