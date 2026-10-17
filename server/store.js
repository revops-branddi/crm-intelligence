import { checked, HttpError } from './errors.js';
export async function allPages(db, snapshotId) {
  const pages = [];
  let offset = 0;
  while (true) {
    const rows = checked(
      await db
        .from('crm_raw_pages')
        .select('*')
        .eq('snapshot_id', snapshotId)
        .order('task_key')
        .range(offset, offset + 499),
    );
    pages.push(...rows);
    if (rows.length < 500) break;
    offset += 500;
  }
  return pages;
}
export async function ownedSnapshot(db, userId, id) {
  const result = await db
    .from('crm_snapshots')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  const row = checked(result);
  if (!row) throw new HttpError(404, 'Extração não encontrada.', 'not_found');
  return row;
}
export function publicSnapshot(row) {
  const { pending, seen_tasks, lease_id, lease_until, user_id, ...publicRow } = row;
  void seen_tasks;
  void lease_id;
  void lease_until;
  void user_id;
  return {
    ...publicRow,
    remainingTasks: pending?.length || 0,
    pendingAttachments: pending?.filter((task) => task.kind === 'attachment').length || 0,
    analysisReady:
      ['complete', 'partial'].includes(row.status) ||
      (row.completed_tasks > 0 &&
        Boolean(pending?.length) &&
        pending.every((task) => task.kind === 'attachment')),
  };
}
