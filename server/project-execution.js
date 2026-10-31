import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { checked, HttpError } from './errors.js';
import { idOf } from './pipedrive.js';
import { latestOperations, readSavedOperations } from './operational-reading.js';
import { buildSources } from './sources.js';
import { companyContext } from './company-context.js';
import { scopeDefaults } from './preparation.js';
import { operationalPreparation } from './operational-advice.js';
import { reportBaseline } from '../src/services/report-baseline.js';
import { reportCampaigns } from '../src/services/report-evidence.js';
const text = z.string().trim().min(1).max(150);
export const projectParameters = z.union([
  z
    .object({
      system: z.literal('serp'),
      action: z.literal('prioritize'),
      campaignId: text,
      brand: text,
      domains: z.array(text).min(1).max(10),
      expectedReadyTasks: z.number().int().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      system: z.literal('serp'),
      brand: text,
      domains: z.array(text).min(1).max(10),
      keywords: z.array(text).min(1).max(8),
      cities: z.array(text).min(1).max(10),
      devices: z
        .array(z.enum(['desktop', 'mobile']))
        .min(1)
        .max(2),
      rounds: z.union([z.literal(1), z.literal(2)]),
      windowHours: z.union([z.literal(1), z.literal(12), z.literal(24)]),
      maxRequests: z.number().int().min(1).max(500),
      allowStageException: z.boolean(),
    })
    .strict(),
  z
    .object({
      system: z.literal('reports'),
      brand: text,
      domain: text,
      slug: z.string().regex(/^[a-zA-Z0-9_.-]{1,120}$/),
      mode: z.enum(['generate', 'regenerate']),
      lookbackDays: z.number().int().min(1).max(365),
      keywords: z.array(text).min(1).max(20),
      campaignIds: z.array(text).min(1).max(20),
    })
    .strict(),
]);
const configs = {
  serp: {
    key: 'SERP_MONITOR_EXECUTE_KEY',
    url: 'https://serp-monitor-zeta.vercel.app/api/internal/crm-intelligence/executions',
  },
  reports: {
    key: 'REPORT_ENGINE_EXECUTE_KEY',
    url: 'https://report.branddi.com/api/internal/crm-intelligence/executions',
  },
};
const executionUrl = (row) =>
  row.parameters?.action === 'prioritize'
    ? configs.serp.url.replace('/executions', '/queue-priority')
    : configs[row.system].url;
const fail = (message, code = 'invalid_execution', status = 409) => {
  throw new HttpError(status, message, code);
};
const stable = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
const digest = (v) => createHash('sha256').update(stable(v)).digest('hex');
const active = ['dispatching', 'accepted', 'running', 'uncertain'];
const publicJob = ({ command, proof, user_id, ...row }) => {
  void command;
  void proof;
  void user_id;
  return row;
};
const records = (pages) =>
  Object.fromEntries(latestOperations(pages).map((p) => [p.payload.data.id, p.payload.data]));
export function executionProof(ops, scope, current, system, parameters) {
  const serp = ops.serp?.facts;
  const reports = ops.reports?.facts?.products?.find((p) => p.product === 'bb');
  const scoped = system === 'reports' && parameters;
  const campaigns = scoped
    ? serp?.campaigns
        .filter((c) => parameters.campaignIds.includes(c.id))
        .sort((a, b) => a.id.localeCompare(b.id))
    : serp?.campaigns;
  return (
    (scoped ? 'v2:' : '') +
    digest({
      scope,
      parameters: scoped ? parameters : undefined,
      org: idOf(current.org_id),
      stage: current.stage_id,
      pipeline: current.pipeline_id,
      serp: serp && {
        state: serp.state,
        coverage: serp.coverage,
        campaigns: campaigns.map(({ queue_detail, ...c }) => ({
          ...c,
          queue_detail:
            queue_detail &&
            Object.fromEntries(
              Object.entries(queue_detail).filter(
                ([k]) => !['observed_at', 'tasks_ahead'].includes(k),
              ),
            ),
        })),
      },
      reports: scoped
        ? {
            state: reports?.state,
            scope: reports?.scope,
            reports: reports?.reports.filter((r) => r.slug === parameters.slug),
          }
        : system === 'reports'
          ? reports
          : undefined,
    })
  );
}
export function validateParameters(params, scope, ops) {
  if (!scope?.confirmedAt) fail('Confirme o escopo comercial em Pendências antes de executar.');
  if (!scope.brands.includes(params.brand))
    fail('Escolha uma marca do escopo comercial confirmado.');
  const domains = params.system === 'serp' ? params.domains : [params.domain];
  if (domains.some((d) => !scope.domains.includes(d)))
    fail('Use somente domínios do escopo confirmado.');
  if (ops.serp?.status !== 'read' || ops.serp.facts.state === 'partial')
    fail('Atualize a consulta do SERP Monitor; a leitura precisa estar completa.');
  for (const list of [
    params.keywords,
    params.cities,
    params.devices,
    params.domains,
    params.campaignIds,
  ].filter(Boolean))
    if (new Set(list).size !== list.length) fail('Remova valores duplicados do escopo.');
  const camps = ops.serp.facts.campaigns;
  if (params.action === 'prioritize') {
    const c = camps.find((c) => c.id === params.campaignId);
    if (
      !c ||
      !c.queue_detail ||
      c.queue_detail.eligible_ready_tasks !== params.expectedReadyTasks ||
      c.queue_detail.unknown_schedule_tasks > 0 ||
      (c.expires_at && Date.parse(c.expires_at) <= Date.now())
    )
      fail('Atualize a fila e selecione apenas tarefas liberadas de uma coleta vigente.');
  } else if (params.system === 'serp') {
    const n = params.keywords.length * params.cities.length * params.devices.length * params.rounds;
    if (params.maxRequests < n) fail(`O limite deve cobrir as ${n} consultas planejadas.`);
    if (
      camps.some(
        (c) =>
          c.queued_tasks > 0 || c.executions.some((e) => ['pending', 'running'].includes(e.status)),
      )
    )
      fail('Aguarde a coleta em andamento antes de aprovar outra.');
  } else {
    const product = ops.reports?.facts?.products.find((p) => p.product === 'bb');
    if (
      ops.reports?.status !== 'read' ||
      !['found', 'not_found', 'not_linked'].includes(product?.state)
    )
      fail('A consulta do Report Engine não confirmou o estado do relatório.');
    const report = product.reports.find((r) => r.slug === params.slug);
    if (params.mode === 'regenerate' && !report)
      fail('Escolha um relatório confirmado para este deal.');
    if (
      report &&
      (report.domain?.toLowerCase().trim() !== params.domain ||
        report.brand?.toLowerCase().trim() !== params.brand.toLowerCase().trim())
    )
      fail('A marca e o domínio devem corresponder ao relatório selecionado.');
    if (params.mode === 'generate' && (product.reports.length || product.linked_in_crm))
      fail('Já existe relatório; selecione o reprocessamento.');
    if (params.mode === 'generate' && !params.slug.startsWith('crm-'))
      fail('Use o identificador proposto para a nova geração.');
    const availableKeywords = new Set();
    const eligible = reportCampaigns(camps, params.lookbackDays);
    for (const id of params.campaignIds) {
      const c = eligible.find((c) => c.id === id);
      if (!c) fail('Selecione coletas concluídas neste período e sem fila pendente.');
      for (const keyword of c.configuration.keywords || []) availableKeywords.add(keyword);
    }
    if (params.keywords.some((k) => !availableKeywords.has(k)))
      fail('Selecione termos exatos presentes nas campanhas escolhidas.');
  }
}
export async function projectAction(input, ctx) {
  const {
    db,
    user,
    snapshot,
    pages,
    currentDeal: current,
    client,
    env = process.env,
    fetcher = fetch,
  } = ctx;
  const identity = {
    companyId: String(snapshot.company_id),
    dealId: Number(snapshot.deal_id),
    orgId: Number(idOf(current.org_id)),
  };
  const saved = pages.find((p) => p.kind === 'deal')?.payload?.data;
  if (identity.orgId !== Number(idOf(saved?.org_id)))
    fail('A organização mudou. Faça uma nova extração.');
  const workflow = checked(
    await db
      .from('crm_preparation_workflows')
      .select('*')
      .eq('user_id', user.id)
      .eq('company_id', snapshot.company_id)
      .eq('deal_id', snapshot.deal_id)
      .maybeSingle(),
  );
  const scope = workflow?.state?.scope;
  const listJobs = async () =>
    checked(
      await db
        .from('crm_project_executions')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', snapshot.company_id)
        .eq('deal_id', snapshot.deal_id)
        .order('created_at', { ascending: false })
        .limit(25),
    );
  if (input.action === 'projectContext') {
    await readSavedOperations(db, snapshot, pages, {
      currentDeal: current,
      env,
      fetcher,
      force: input.refresh,
    });
    const people = (await client.get('/api/v1/users')).data || [];
    const sources = buildSources(pages);
    const defaults = scopeDefaults(snapshot, companyContext(sources));
    const recommendations = operationalPreparation(
      pages,
      sources,
      snapshot,
      scope || defaults,
    ).items;
    return {
      operations: records(pages),
      scope,
      defaults,
      recommendations,
      assignees: people
        .filter((p) => p.active_flag !== false && p.active_flag !== 0 && p.id && p.name)
        .map((p) => ({ id: String(p.id), name: p.name })),
      defaultAssigneeId: String(idOf(current.owner_id) || ''),
      executions: (await listJobs()).map(publicJob),
      enabled: Object.fromEntries(
        Object.entries(configs).map(([k, c]) => [
          k,
          Boolean(env[c.key] && env.OPERATIONS_COMPANY_ID === snapshot.company_id),
        ]),
      ),
    };
  }
  if (input.action === 'prepareProjectAction') {
    const params = projectParameters.parse(input.parameters),
      system = params.system;
    if (!env[configs[system].key] || env.OPERATIONS_COMPANY_ID !== snapshot.company_id)
      fail('Execução ainda não configurada para esta conta.');
    await readSavedOperations(db, snapshot, pages, {
      currentDeal: current,
      env,
      fetcher,
      force: true,
    });
    const ops = records(pages);
    validateParameters(params, scope, ops);
    if (Number(scope.organizationId) !== identity.orgId)
      fail('Confirme novamente o escopo da organização atual.');
    const people = (await client.get('/api/v1/users')).data || [];
    const owner = people.find(
      (p) => String(p.id) === input.assigneeId && p.active_flag !== false && p.active_flag !== 0,
    );
    if (!owner) fail('Escolha um responsável ativo no CRM.');
    const { system: unused, ...fields } = params;
    void unused;
    const command = {
      ...identity,
      ...fields,
      actor: user.email || user.id,
      assigneeId: input.assigneeId,
      reason: input.reason,
    };
    if (system === 'serp') {
      command.pipelineId = current.pipeline_id;
      command.stageId = current.stage_id;
    } else
      command.expectedGeneratedAt =
        ops.reports.facts.products
          .find((p) => p.product === 'bb')
          .reports.find((r) => r.slug === params.slug)?.generated_at || null;
    const row = checked(
      await db
        .from('crm_project_executions')
        .insert({
          id: randomUUID(),
          user_id: user.id,
          company_id: snapshot.company_id,
          deal_id: snapshot.deal_id,
          org_id: String(identity.orgId),
          snapshot_id: snapshot.id,
          system,
          status: 'draft',
          parameters: params,
          command,
          proof: executionProof(ops, scope, current, system, params),
          result:
            system === 'reports'
              ? {
                  review: reportBaseline(
                    ops.reports.facts.products
                      .find((p) => p.product === 'bb')
                      .reports.find((r) => r.slug === params.slug),
                    params.lookbackDays,
                  ),
                }
              : null,
          assignee: { id: input.assigneeId, name: owner.name },
          reason: input.reason,
          expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
        })
        .select('*')
        .single(),
    );
    return { execution: publicJob(row) };
  }
  let row = checked(
    await db
      .from('crm_project_executions')
      .select('*')
      .eq('id', input.executionId)
      .eq('user_id', user.id)
      .eq('snapshot_id', snapshot.id)
      .maybeSingle(),
  );
  if (!row) fail('Ação não encontrada.', 'not_found', 404);
  if (row.org_id !== String(identity.orgId)) fail('O vínculo da organização mudou.');
  const config = configs[row.system];
  if (input.action === 'approveProjectAction') {
    if (row.status !== 'draft') return { execution: publicJob(row) };
    if (Date.parse(row.expires_at) < Date.now())
      fail('A proposta expirou. Revise os parâmetros novamente.');
    await readSavedOperations(db, snapshot, pages, {
      currentDeal: current,
      env,
      fetcher,
      force: true,
    });
    const ops = records(pages);
    validateParameters(row.parameters, scope, ops);
    if (
      executionProof(
        ops,
        scope,
        current,
        row.system,
        row.proof.startsWith('v2:') ? row.parameters : undefined,
      ) !== row.proof
    )
      fail('Os dados mudaram desde a revisão. Prepare uma nova proposta.');
    const owner = (await client.get('/api/v1/users')).data?.find(
      (p) => String(p.id) === row.assignee.id && p.active_flag !== false && p.active_flag !== 0,
    );
    if (!owner) fail('O responsável não está mais ativo. Revise a proposta.');
    const command = { ...row.command, id: row.id, approvedAt: new Date().toISOString() };
    const claim = await db
      .from('crm_project_executions')
      .update({
        status: 'dispatching',
        approved_at: command.approvedAt,
        approved_by: user.email || user.id,
        command,
        updated_at: command.approvedAt,
      })
      .eq('id', row.id)
      .eq('status', 'draft')
      .select('*')
      .maybeSingle();
    if (claim.error?.code === '23505')
      fail('Já há uma ação deste projeto em andamento para o deal.');
    row = checked(claim);
    if (!row) fail('Esta proposta já foi aprovada. Atualize o acompanhamento.');
    // The durable claim precedes the only dispatch. Ambiguous responses are reconciled by GET.
    let status = 'uncertain',
      result = { message: 'Confirmando o pedido no sistema. Não reenvie a ação.' };
    try {
      const response = await fetcher(executionUrl(row), {
        method: 'POST',
        headers: { Authorization: `Bearer ${env[config.key]}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
        redirect: 'error',
        signal: AbortSignal.timeout(18000),
      });
      const body = await response.json();
      if (
        response.ok &&
        body.id === row.id &&
        [
          'accepted',
          'running',
          'completed',
          'preserved',
          'partial',
          'uncertain',
          'failed',
        ].includes(body.status)
      ) {
        status = body.status;
        result = body;
      } else if ([400, 401, 403, 409, 422].includes(response.status)) {
        status = 'failed';
        result = {
          message: `O sistema recusou a ação (${body.error || response.status}). Revise os parâmetros antes de tentar novamente.`,
        };
      }
    } catch {
      /* never repeat a POST after an ambiguous outcome */
    }
    row = checked(
      await db
        .from('crm_project_executions')
        .update({ status, result, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select('*')
        .single(),
    );
  } else if (input.action === 'projectExecution' && active.includes(row.status)) {
    try {
      const url = new URL(executionUrl(row));
      url.search = new URLSearchParams({ ...identity, id: row.id });
      const response = await fetcher(url, {
        headers: { Authorization: `Bearer ${env[config.key]}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      if (
        response.ok &&
        body.id === row.id &&
        [
          'accepted',
          'running',
          'completed',
          'partial',
          'preserved',
          'failed',
          'uncertain',
        ].includes(body.status)
      )
        row = checked(
          await db
            .from('crm_project_executions')
            .update({ status: body.status, result: body, updated_at: new Date().toISOString() })
            .eq('id', row.id)
            .select('*')
            .single(),
        );
    } catch {
      /* preserve last receipt; unavailable does not mean failed */
    }
  }
  return { execution: publicJob(row) };
}
