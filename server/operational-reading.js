import { createHash } from 'node:crypto';
import { z } from 'zod';
import { checked } from './errors.js';
import { idOf } from './pipedrive.js';

const nullable = z.string().max(300).nullable();
const count = z.number().finite().nonnegative().nullable();
const list = z.array(z.string().max(200)).max(100).nullable();
const date = z.string().datetime({ offset: true }).nullable();
const identitySchema = {
  company_id: z.string(),
  deal_id: z.number().int().positive(),
  org_id: z.number().int().positive(),
  read_at: z.string().datetime({ offset: true }),
};
const monitoringSchema = z.object({
  ...identitySchema,
  version: z.literal('crm-monitoring-v1'),
  source: z.literal('serp-monitor'),
  state: z.enum(['complete', 'partial', 'not_found']),
  coverage: z.object({
    campaigns_complete: z.boolean(),
    executions_complete: z.boolean(),
    queue_complete: z.boolean(),
  }),
  field_issues: z.array(z.string().max(300)).max(150),
  campaigns: z
    .array(
      z.object({
        id: z.string().max(256),
        company_id: z.string().max(256),
        created_at: date,
        updated_at: date,
        expires_at: date,
        is_active: z.boolean().nullable(),
        status: nullable,
        queued_tasks: count,
        queue_detail: z
          .object({
            observed_at: z.string().datetime({ offset: true }),
            ready_tasks: count,
            scheduled_tasks: count,
            processing_tasks: count,
            stale_processing_tasks: count,
            unknown_schedule_tasks: count,
            next_scheduled_at: date,
            oldest_ready_at: date,
            last_updated_at: date,
          })
          .optional(),
        spreadsheet_attached_at: date,
        configuration: z.object({
          keywords: list,
          cities: list,
          devices: list,
          search_engines: list,
          own_domains: list,
          daily_requests_limit: count,
        }),
        executions: z
          .array(
            z.object({
              id: z.string().max(256),
              status: nullable,
              started_at: date,
              finished_at: date,
              total_tasks: count,
              completed_tasks: count,
              error_tasks: count,
              planned_tasks: count,
              queue_completed_tasks: count,
              terminal_queue_failures: count,
              tasks_with_ads: count,
              num_competitors: count,
              possible_soft_block: z.boolean().nullable().optional(),
            }),
          )
          .max(400),
      }),
    )
    .max(20),
});
const reportsSchema = z.object({
  ...identitySchema,
  version: z.literal('crm-reports-v1'),
  source: z.literal('report-engine'),
  products: z
    .array(
      z.object({
        product: z.enum(['bb', 'bbp', 'gd']),
        linked_in_crm: z.boolean(),
        scope: z.string().max(100),
        state: z.enum([
          'found',
          'partial',
          'not_found',
          'not_linked',
          'unavailable',
          'identity_conflict',
          'unsupported_link',
          'gated',
        ]),
        reports: z
          .array(
            z.object({
              slug: z.string().regex(/^[a-zA-Z0-9_.-]{1,120}$/),
              status: nullable,
              url: z
                .string()
                .max(300)
                .regex(
                  /^https:\/\/report\.branddi\.com\/(?:report\/[a-zA-Z0-9_.-]{1,120}|[a-zA-Z0-9_.-]{1,120}\/(?:bbp|gd))$/,
                ),
              linked_in_crm: z.boolean(),
              generated_at: date,
              record_created_at: date.optional(),
              summary_observed_at: date.optional(),
              brand: nullable.optional(),
              domain: nullable.optional(),
              advertisers_count: count.optional(),
              exposure_score: count.optional(),
              keywords: list.optional(),
              evidence_window: z.object({ from: date, to: date }).optional(),
              sellers: count.optional(),
              price_threats: count.optional(),
              severity: nullable.optional(),
              suspicious: count.optional(),
              takedown: count.optional(),
              quarantine: count.optional(),
            }),
          )
          .max(5),
      }),
    )
    .length(3)
    .refine((items) => new Set(items.map((item) => item.product)).size === 3),
});
const providers = [
  {
    id: 'serp',
    name: 'SERP Monitor',
    key: 'SERP_MONITOR_READ_KEY',
    url: 'https://serp-monitor-zeta.vercel.app/api/internal/crm-intelligence/monitoring',
    schema: monitoringSchema,
  },
  {
    id: 'reports',
    name: 'Report Engine',
    key: 'REPORT_ENGINE_READ_KEY',
    url: 'https://report.branddi.com/api/internal/crm-intelligence/reports',
    schema: reportsSchema,
  },
];
export function latestOperations(pages) {
  const latest = new Map();
  for (const page of pages.filter((p) => p.kind === 'operational')) {
    const data = page.payload?.data;
    if (data?.readerVersion !== 'crm-operational-v1') continue;
    if (
      !latest.has(data.id) ||
      Date.parse(data.readAt) > Date.parse(latest.get(data.id).payload.data.readAt)
    )
      latest.set(data.id, page);
  }
  return [...latest.values()];
}
async function boundedJson(response) {
  if (Number(response.headers.get('content-length')) > 750000) throw new Error('response_limit');
  const reader = response.body.getReader();
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 750000) throw new Error('response_limit');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel();
  }
}
export async function readSavedOperations(
  db,
  snapshot,
  pages,
  { currentDeal, env = process.env, fetcher = fetch, now = Date.now(), force = false },
) {
  const savedDeal = pages.find((p) => p.kind === 'deal')?.payload?.data;
  const identity = {
    company_id: String(snapshot.company_id),
    deal_id: Number(snapshot.deal_id),
    org_id: Number(idOf(currentDeal.org_id)),
  };
  const matches =
    identity.deal_id === Number(currentDeal.id) &&
    identity.org_id > 0 &&
    identity.org_id === Number(idOf(savedDeal?.org_id));
  const latest = latestOperations(pages);
  const results = await Promise.all(
    providers.map(async (provider) => {
      const old = latest.find((p) => p.payload.data.id === provider.id)?.payload.data;
      const age = now - Date.parse(old?.readAt);
      if (
        !force &&
        matches &&
        old &&
        Object.entries(identity).every(([key, value]) => old.identity?.[key] === value) &&
        age >= 0 &&
        age < (old.status === 'read' ? 120000 : 30000)
      )
        return null;
      // Forced reads in the same millisecond must replace the previous evidence.
      const readAt = new Date(Math.max(now, (Date.parse(old?.readAt) || 0) + 1)).toISOString();
      let status = 'unavailable',
        facts = null;
      if (!matches) status = 'identity_changed';
      else if (identity.company_id !== env.OPERATIONS_COMPANY_ID) status = 'not_configured';
      else if (!env[provider.key]) status = 'not_configured';
      else {
        try {
          const url = new URL(provider.url);
          for (const [key, value] of Object.entries(identity))
            url.searchParams.set(key, String(value));
          const response = await fetcher(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${env[provider.key]}`, Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(12000),
          });
          if (!response.ok) {
            await response.body?.cancel();
            status = response.status === 409 ? 'identity_conflict' : 'unavailable';
          } else {
            const parsed = provider.schema.parse(await boundedJson(response));
            if (
              parsed.company_id !== identity.company_id ||
              parsed.deal_id !== identity.deal_id ||
              parsed.org_id !== identity.org_id
            )
              status = 'identity_conflict';
            else if (Math.abs(now - Date.parse(parsed.read_at)) > 5 * 60 * 1000)
              status = 'stale_source';
            else {
              facts = parsed;
              status = 'read';
            }
          }
        } catch {
          status = 'unavailable';
        }
      }
      const data = {
        id: provider.id,
        name: provider.name,
        readerVersion: 'crm-operational-v1',
        readAt,
        identity,
        status,
        facts,
      };
      const taskKey = createHash('sha256').update(JSON.stringify(data)).digest('hex');
      const page = {
        snapshot_id: snapshot.id,
        task_key: taskKey,
        kind: 'operational',
        request: { url: provider.url, readerVersion: data.readerVersion },
        payload: { data },
        failure: null,
      };
      checked(await db.from('crm_raw_pages').insert(page));
      return page;
    }),
  );
  pages.push(...results.filter(Boolean));
  return latestOperations(pages).map((p) => p.payload.data);
}
