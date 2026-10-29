import { readSavedMaterials } from './material-reading.js';
import { z } from 'zod';
import { database, authenticate, encryptToken, decryptToken, limit } from './security.js';
import { pipedriveClient, positiveId } from './pipedrive.js';
import { checked, HttpError } from './errors.js';
import { startExtraction, extractionBatch } from './extraction.js';
import { allPages, ownedSnapshot, publicSnapshot } from './store.js';
import { buildSources } from './sources.js';
import { dealDetails } from './deal-details.js';
import { generateAnswer } from './analysis.js';
import { analysisConfiguration } from './llm-provider.js';
import { dealMaterials } from './materials.js';
import { companyContext } from './company-context.js';
import { preparationAction } from './preparation.js';
import { readSavedSpreadsheets, spreadsheetInventory } from './spreadsheet-reading.js';

const uuid = z.string().uuid();
const assigneeId = z.string().regex(/^[1-9]\d{0,14}$/);
const preparationRevision = z.number().int().min(0);
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('disconnect') }),
  z.object({ action: z.literal('connect'), token: z.string().trim().min(20).max(512) }),
  z.object({ action: z.literal('list'), offset: z.number().int().min(0).max(100000).default(0) }),
  z.object({ action: z.literal('latest'), dealId: z.string().regex(/^[1-9]\d{0,14}$/) }),
  z.object({ action: z.literal('start'), dealId: z.string().regex(/^[1-9]\d{0,14}$/) }),
  ...[
    'step',
    'get',
    'answers',
    'materials',
    'company',
    'preparation',
    'spreadsheets',
    'readSpreadsheets',
  ].map((action) => z.object({ action: z.literal(action), snapshotId: uuid })),
  z.object({
    action: z.literal('saveScope'),
    snapshotId: uuid,
    revision: preparationRevision,
    assigneeId,
    scope: z.object({
      kind: z.enum(['brand', 'group']),
      brands: z.array(z.string().trim().min(2).max(100)).min(1).max(10),
      domains: z
        .array(
          z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
        )
        .min(1)
        .max(20),
      product: z.string().trim().min(2).max(160),
      maxAgeDays: z.number().int().min(1).max(365),
    }),
  }),
  z.object({
    action: z.literal('savePreparationTask'),
    snapshotId: uuid,
    revision: preparationRevision,
    taskId: z.string().min(1).max(100),
    assigneeId,
    status: z.enum(['open', 'in_progress', 'resolved', 'dismissed']),
    note: z.string().trim().max(2000),
    dueDate: z.union([z.literal(''), z.string().date()]).default(''),
    approveHelpdesk: z.boolean().default(false),
    draft: z
      .object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().min(15).max(3800),
      })
      .optional(),
  }),
  z.object({
    action: z.literal('validateMaterial'),
    snapshotId: uuid,
    materialKey: z.string().regex(/^material:[a-f\d]{24}$/),
  }),
  z.object({
    action: z.literal('sources'),
    snapshotId: uuid,
    query: z.string().max(500).default(''),
    offset: z.number().int().min(0).default(0),
  }),
  z.object({
    action: z.literal('details'),
    snapshotId: uuid,
    offset: z.number().int().min(0).default(0),
  }),
  z.object({
    action: z.literal('text'),
    snapshotId: uuid,
    offset: z.number().int().min(0).default(0),
  }),
  z.object({ action: z.literal('source'), snapshotId: uuid, sourceId: z.string().min(1).max(200) }),
  z.object({
    action: z.literal('raw'),
    snapshotId: uuid,
    taskKey: z.string().regex(/^[a-f\d]{64}$/),
    offset: z.number().int().min(0).default(0),
  }),
  z.object({
    action: z.literal('attachment'),
    snapshotId: uuid,
    taskKey: z.string().regex(/^[a-f\d]{64}$/),
  }),
  z.object({
    action: z.literal('answer'),
    snapshotId: uuid,
    mode: z.enum(['overview', 'briefing', 'prospecting', 'question']),
    question: z.string().trim().max(2000).default(''),
  }),
]);
export async function connectionFor(db, user, env = process.env) {
  const connection = checked(
    await db.from('crm_connections').select('*').eq('user_id', user.id).maybeSingle(),
  );
  if (!connection)
    throw new HttpError(409, 'Conecte sua conta do Pipedrive primeiro.', 'not_connected');
  return { ...connection, token: decryptToken(connection.encrypted_token, user.id, env) };
}
export async function handleAction(
  input,
  {
    db,
    user,
    env = process.env,
    clientFactory = pipedriveClient,
    generate = generateAnswer,
    materialReader,
  },
) {
  if (input.action === 'status') {
    const connection = checked(
      await db
        .from('crm_connections')
        .select('company_id,crm_user_id,updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
    );
    return {
      connection,
      ...analysisConfiguration(env),
    };
  }
  if (input.action === 'connect') {
    await limit(db, user.id, 'connect', 5, 60);
    const body = await clientFactory(input.token).get('/api/v1/users/me');
    const companyId = body.data?.company_id;
    const crmUserId = body.data?.id;
    if (!companyId || !crmUserId)
      throw new HttpError(
        422,
        'Não foi possível identificar a conta do Pipedrive.',
        'invalid_connection',
      );
    checked(
      await db.from('crm_connections').upsert({
        user_id: user.id,
        company_id: String(companyId),
        crm_user_id: String(crmUserId),
        encrypted_token: encryptToken(input.token, user.id, env),
        updated_at: new Date().toISOString(),
      }),
    );
    return { connected: true };
  }
  if (input.action === 'disconnect') {
    checked(await db.from('crm_connections').delete().eq('user_id', user.id));
    return { connected: false };
  }
  const connection = await connectionFor(db, user, env);
  const client = clientFactory(connection.token);
  if (input.action === 'list') {
    const rows = checked(
      await db
        .from('crm_snapshots')
        .select('id,deal_id,title,status,started_at,completed_at,completed_tasks')
        .eq('user_id', user.id)
        .eq('company_id', connection.company_id)
        .order('started_at', { ascending: false })
        .range(input.offset, input.offset + 19),
    );
    if (!rows.length) return { snapshots: [], hasMore: false };
    const visible = await client.get('/api/v2/deals', {
      ids: [...new Set(rows.map((row) => row.deal_id))].join(','),
      limit: 100,
    });
    const allowed = new Set((visible.data || []).map((deal) => String(deal.id)));
    return {
      snapshots: rows.filter((row) => allowed.has(row.deal_id)),
      hasMore: rows.length === 20,
    };
  }
  if (input.action === 'latest') {
    const id = positiveId(input.dealId);
    const visible = await client.get(`/api/v2/deals/${id}`);
    if (!visible.data?.id)
      throw new HttpError(403, 'O negócio não está acessível no Pipedrive.', 'forbidden');
    const rows = checked(
      await db
        .from('crm_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', connection.company_id)
        .eq('deal_id', id)
        .order('started_at', { ascending: false })
        .limit(20),
    );
    const snapshot = rows.find((row) => publicSnapshot(row).analysisReady);
    if (!snapshot) return { snapshot: null, answers: [] };
    const answers = checked(
      await db
        .from('crm_answers')
        .select('*')
        .eq('snapshot_id', snapshot.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    );
    return { snapshot: publicSnapshot(snapshot), answers };
  }
  if (input.action === 'start') {
    await limit(db, user.id, 'extraction-daily', 100, 86400);
    const id = positiveId(input.dealId);
    const body = await client.get(`/api/v2/deals/${id}`);
    if (!body.data?.id) throw new HttpError(404, 'Negócio não encontrado.', 'not_found');
    return { snapshot: await startExtraction(db, user, connection, id, body.data) };
  }
  const snapshot = await ownedSnapshot(db, user.id, input.snapshotId);
  if (snapshot.company_id !== connection.company_id)
    throw new HttpError(403, 'Esta extração pertence a outra conta do CRM.', 'forbidden');
  // Ownership in our DB never overrides current visibility in the CRM.
  const current = await client.get(`/api/v2/deals/${positiveId(snapshot.deal_id)}`);
  if (!current.data?.id)
    throw new HttpError(403, 'O negócio não está acessível no Pipedrive.', 'forbidden');
  if (input.action === 'step')
    return {
      snapshot: await extractionBatch({ db, user, snapshot, client, currentDeal: current.data }),
    };
  if (input.action === 'get')
    return { snapshot: publicSnapshot(snapshot), currentCrmUpdatedAt: current.data.update_time };
  if (input.action === 'answers')
    return {
      answers: checked(
        await db
          .from('crm_answers')
          .select('*')
          .eq('snapshot_id', snapshot.id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ),
    };
  if (['raw', 'attachment'].includes(input.action)) {
    const page = checked(
      await db
        .from('crm_raw_pages')
        .select('*')
        .eq('snapshot_id', snapshot.id)
        .eq('task_key', input.taskKey)
        .maybeSingle(),
    );
    if (!page) throw new HttpError(404, 'Fonte não encontrada.', 'not_found');
    if (input.action === 'raw') {
      const serialized = JSON.stringify(page);
      // Stay below serverless response limits, including escaped Unicode content.
      if (serialized.length <= 250000) return { page };
      const offset = input.offset || 0;
      const end = Math.min(offset + 250000, serialized.length);
      return {
        rawChunk: serialized.slice(offset, end),
        nextOffset: end < serialized.length ? end : null,
      };
    }
    if (page.kind !== 'attachment' || !page.payload?.data?.storagePath)
      throw new HttpError(404, 'Original indisponível para download.', 'not_found');
    const file = page.payload.data;
    const result = checked(
      await db.storage
        .from('crm-originals')
        .createSignedUrl(file.storagePath, 60, { download: file.name }),
    );
    return { url: result.signedUrl };
  }
  const pages = await allPages(db, snapshot.id);
  if (input.action === 'spreadsheets') return { files: spreadsheetInventory(pages) };
  if (input.action === 'readSpreadsheets') {
    await limit(db, user.id, 'spreadsheet-reading', 20, 3600);
    return readSavedSpreadsheets(db, snapshot, pages);
  }
  let sources = buildSources(pages);
  if (
    ['preparation', 'saveScope', 'savePreparationTask', 'validateMaterial'].includes(input.action)
  ) {
    if (input.action === 'validateMaterial') await limit(db, user.id, 'material-checks', 30, 3600);
    return preparationAction(input, {
      db,
      user,
      snapshot,
      sources,
      currentDeal: current.data,
      client,
    });
  }
  if (input.action === 'company') return companyContext(sources);
  if (input.action === 'materials') return dealMaterials(sources);
  if (input.action === 'details') return dealDetails(pages, sources, input.offset || 0);
  if (input.action === 'text') {
    const text = sources
      .map((source) =>
        source.part === 0
          ? `\n\n--- ${source.title} | Fonte: ${source.id} ---\n${source.text}`
          : source.text,
      )
      .join('');
    const offset = input.offset || 0,
      end = Math.min(offset + 150000, text.length);
    return {
      text: text.slice(offset, end),
      totalCharacters: text.length,
      nextOffset: end < text.length ? end : null,
    };
  }
  if (input.action === 'source') {
    const source = sources.find((item) => item.id === input.sourceId);
    if (!source) throw new HttpError(404, 'Fonte não encontrada.', 'not_found');
    return { source };
  }
  if (input.action === 'sources') {
    const query = input.query.toLocaleLowerCase('pt-BR');
    const filtered = sources.filter(
      (source) =>
        !query || `${source.title} ${source.text}`.toLocaleLowerCase('pt-BR').includes(query),
    );
    return { sources: filtered.slice(input.offset, input.offset + 30), total: filtered.length };
  }
  if (input.action === 'answer') {
    if (!publicSnapshot(snapshot).analysisReady)
      throw new HttpError(409, 'Conclua a coleta antes de analisar.', 'incomplete_extraction');
    if (input.mode === 'question' && !input.question)
      throw new HttpError(400, 'Escreva uma pergunta.', 'invalid_question');
    await limit(db, user.id, 'analysis-minute', 3, 60);
    await limit(db, user.id, 'analysis-daily', Number(env.AI_REQUESTS_PER_USER_DAY) || 30, 86400);
    await limit(
      db,
      'application',
      'analysis-daily',
      Number(env.AI_REQUESTS_GLOBAL_DAY) || 300,
      86400,
    );
    const spreadsheets = await readSavedSpreadsheets(db, snapshot, pages);
    await readSavedMaterials(db, snapshot, pages, materialReader);
    sources = buildSources(pages);
    const readFiles = new Set(
      spreadsheets.files.filter((f) => f.status === 'readable').map((f) => f.id),
    );
    const generated = await generate({
      sources,
      snapshot: {
        ...snapshot,
        completed_at: snapshot.completed_at || snapshot.metrics?.referenceAt,
        gaps: [
          ...snapshot.gaps.filter(
            (gap) => !readFiles.has(gap.path?.match(/\/files\/(\d+)\/download/)?.[1]),
          ),
          ...(spreadsheets.remaining
            ? [
                {
                  resource: 'attachment',
                  code: 'pending_spreadsheets',
                  message: `${spreadsheets.remaining} planilhas aguardam leitura; atualize a análise para continuar.`,
                },
              ]
            : []),
          ...(snapshot.pending.length
            ? [
                {
                  resource: 'attachment',
                  code: 'pending_attachments',
                  message: `${snapshot.pending.length} anexos ainda em preservação. Esta análise usa o texto já coletado; os arquivos pendentes não foram consultados.`,
                },
              ]
            : []),
        ],
      },
      mode: input.mode,
      question: input.question,
      env,
    });
    const row = checked(
      await db
        .from('crm_answers')
        .insert({
          snapshot_id: snapshot.id,
          user_id: user.id,
          mode: input.mode,
          question: input.question,
          ...generated,
        })
        .select('*')
        .single(),
    );
    return { answer: row };
  }
  throw new HttpError(400, 'Operação inválida.', 'invalid_action');
}
export function createHandler({
  getDatabase = database,
  auth = authenticate,
  action = handleAction,
  env = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST')
      return res.status(405).json({ error: 'Método não permitido.', code: 'method_not_allowed' });
    try {
      if (Buffer.byteLength(JSON.stringify(req.body || {})) > 12000)
        throw new HttpError(413, 'Solicitação muito grande.', 'size_limit');
      const db = getDatabase(env);
      const user = await auth(req, db, env);
      const parsed = inputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new HttpError(400, 'Solicitação inválida. Verifique os campos.', 'invalid_input');
      await limit(db, user.id, 'api-minute', 90, 60);
      return res.status(200).json(await action(parsed.data, { db, user, env }));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
      // No payload, email, tokens, model output, or upstream URL in application logs.
      if (status >= 500)
        console.error('CRM request failed', { status, code: error.code || 'internal_error' });
      return res.status(status).json({
        error:
          error instanceof HttpError
            ? error.message
            : 'Falha interna. Seus dados já salvos permanecem disponíveis.',
        code: error.code || 'internal_error',
        retryAfter: error.retryAfter || null,
      });
    }
  };
}
