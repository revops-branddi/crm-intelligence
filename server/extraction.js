import { randomUUID } from 'node:crypto';
import { checked, HttpError } from './errors.js';
import {
  advancePlan,
  coveredMailTasks,
  discoverTasks,
  initialPlan,
  taskKey,
} from './extraction-plan.js';
import { allPages, ownedSnapshot, publicSnapshot } from './store.js';
import { collectAttachment } from './attachments.js';
import { snapshotMetrics } from './sources.js';

async function saveProgress(db, user, snapshot, lease, next) {
  const updated = checked(
    await db
      .from('crm_snapshots')
      .update(next)
      .eq('id', snapshot.id)
      .eq('user_id', user.id)
      .eq('lease_id', lease)
      .select('*')
      .maybeSingle(),
  );
  if (!updated)
    throw new HttpError(
      409,
      'A coleta perdeu a reserva de processamento. Retome a extração.',
      'busy',
      5,
    );
  return publicSnapshot(updated);
}

export async function startExtraction(db, user, connection, dealId, deal) {
  const task = {
    kind: 'deal',
    path: `/api/v2/deals/${dealId}`,
    params: {
      include_fields:
        'next_activity_id,last_activity_id,first_won_time,products_count,files_count,notes_count,followers_count,email_messages_count,activities_count,done_activities_count,undone_activities_count,participants_count,last_incoming_mail_time,last_outgoing_mail_time,smart_bcc_email',
      include_option_labels: true,
      include_labels: true,
    },
  };
  const row = checked(
    await db
      .from('crm_snapshots')
      .insert({
        user_id: user.id,
        company_id: connection.company_id,
        deal_id: dealId,
        title: deal.title || `Deal ${dealId}`,
        pending: [task],
        seen_tasks: [taskKey(task)],
      })
      .select('*')
      .single(),
  );
  return publicSnapshot(row);
}
async function materialize({ db, snapshot, client }, task) {
  const key = taskKey(task);
  const existing = checked(
    await db
      .from('crm_raw_pages')
      .select('*')
      .eq('snapshot_id', snapshot.id)
      .eq('task_key', key)
      .maybeSingle(),
  );
  if (existing) return { page: existing };
  let payload = null,
    failure = null;
  try {
    payload =
      task.kind === 'attachment'
        ? await collectAttachment(task, snapshot, client, db)
        : await client.get(task.path, task.params);
  } catch (error) {
    if (error.code === 'size_limit' && task.pagination && Number(task.params.limit) > 1)
      return {
        smaller: {
          ...task,
          params: { ...task.params, limit: Math.max(1, Math.floor(task.params.limit / 2)) },
        },
      };
    if (![400, 403, 404, 410, 413, 422].includes(error.status) || task.kind === 'deal') throw error;
    failure = { status: error.status, code: error.code, message: error.message };
  }
  const page = {
    snapshot_id: snapshot.id,
    task_key: key,
    kind: task.kind,
    request: task,
    payload,
    failure,
  };
  checked(await db.from('crm_raw_pages').insert(page));
  return { page };
}
export async function extractionStep(args) {
  return extractionBatch(args, { maxTasks: 1, concurrency: 1 });
}
export async function extractionBatch(
  { db, user, snapshot, client, currentDeal },
  { maxTasks = 32, concurrency = 4, budgetMs = 25000 } = {},
) {
  if (snapshot.status !== 'collecting') return publicSnapshot(snapshot);
  const lease = randomUUID();
  if (
    !checked(
      await db.rpc('crm_claim_snapshot', { p_id: snapshot.id, p_user: user.id, p_lease: lease }),
    )
  )
    throw new HttpError(
      409,
      'Esta extração está sendo processada em outra solicitação. Aguarde.',
      'busy',
      5,
    );
  const started = Date.now();
  try {
    snapshot = await ownedSnapshot(db, user.id, snapshot.id);
    snapshot.pending.sort(
      (a, b) => Number(a.kind === 'attachment') - Number(b.kind === 'attachment'),
    );
    if (!snapshot.pending.length)
      throw new HttpError(500, 'Fila de extração inconsistente.', 'invalid_queue');
    let processed = 0;
    while (snapshot.pending.length && processed < maxTasks) {
      const coreTasks = snapshot.pending.filter((task) => task.kind !== 'attachment');
      const tasks = (coreTasks.length ? coreTasks : snapshot.pending).slice(
        0,
        Math.min(concurrency, maxTasks - processed),
      );
      // All workers settle before releasing the lease. Originals are saved first;
      // replay after a failure reuses them, even when the queue checkpoint failed.
      const results = await Promise.allSettled(
        tasks.map((task) => materialize({ db, snapshot, client }, task)),
      );
      let transient = null,
        resized = false;
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (taskKey(snapshot.pending[0] || {}) !== taskKey(task)) continue; // covered by a full mail index
        const result = results[i];
        if (result.status === 'rejected') {
          transient = result.reason;
          break;
        }
        if (result.value.smaller) {
          const smaller = result.value.smaller;
          snapshot = {
            ...snapshot,
            pending: [smaller, ...snapshot.pending.slice(1)],
            seen_tasks: [...snapshot.seen_tasks, taskKey(smaller)],
          };
          resized = true;
          break;
        }
        const { page } = result.value;
        const gaps = [...snapshot.gaps];
        let discovered = [];
        if (page.failure) gaps.push({ resource: task.kind, path: task.path, ...page.failure });
        else {
          discovered =
            task.kind === 'deal'
              ? initialPlan(page.payload.data)
              : discoverTasks(task, page.payload);
          if (task.kind === 'attachment' && page.payload.data.textStatus !== 'readable')
            gaps.push({
              resource: 'attachment',
              path: task.path,
              code: page.payload.data.textStatus,
              message: page.payload.data.note,
            });
        }
        snapshot = {
          ...snapshot,
          ...advancePlan(snapshot, task, discovered, coveredMailTasks(task, page.payload)),
          gaps,
        };
        processed++;
      }
      const { pending, seen_tasks, completed_tasks, last_resource, gaps } = snapshot;
      const next = { pending, seen_tasks, completed_tasks, last_resource, gaps };
      const coreJustFinished =
        pending.length > 0 &&
        pending.every((task) => task.kind === 'attachment') &&
        !snapshot.metrics?.referenceAt;
      if (coreJustFinished)
        next.metrics = snapshotMetrics(await allPages(db, snapshot.id), new Date().toISOString());
      if (!pending.length) {
        const completedAt = new Date().toISOString();
        const pages = await allPages(db, snapshot.id);
        const originalDeal = pages.find((p) => p.kind === 'deal')?.payload?.data;
        if (originalDeal?.update_time !== currentDeal.update_time)
          gaps.push({
            resource: 'deal',
            code: 'changed_during_collection',
            message:
              'O negócio mudou durante a coleta. Gere uma nova extração para obter uma versão mais recente.',
          });
        next.status = gaps.length ? 'partial' : 'complete';
        next.completed_at = completedAt;
        next.metrics = snapshotMetrics(pages, completedAt);
      }
      await saveProgress(db, user, snapshot, lease, next);
      snapshot = { ...snapshot, ...next };
      if (transient) throw transient;
      if (coreJustFinished || resized || Date.now() - started >= budgetMs) break;
    }
    return await saveProgress(db, user, snapshot, lease, { lease_id: null, lease_until: null });
  } catch (error) {
    await db
      .from('crm_snapshots')
      .update({ lease_id: null, lease_until: null })
      .eq('id', snapshot.id)
      .eq('lease_id', lease);
    throw error;
  }
}
