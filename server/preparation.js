import { checked, HttpError } from './errors.js';
import { idOf } from './pipedrive.js';
import { companyContext } from './company-context.js';
import { dealMaterials } from './materials.js';
import { reviewItems, draftForReview } from '../src/services/briefing.js';
import { digest, normalize, scopeDigest, validateMaterial } from './material-validation.js';

const conflict = () =>
  new HttpError(
    409,
    'A preparação mudou. Atualize o painel antes de salvar novamente.',
    'workflow_conflict',
  );
const error = (message) => new HttpError(422, message, 'invalid_preparation');
const materialKey = (material) => `material:${digest(material.url).slice(0, 24)}`;
const history = (state, event, user) =>
  [
    ...(state.history || []),
    { ...event, actor: user.email || user.id, at: new Date().toISOString() },
  ].slice(-100);
const actor = (person) => (person ? { id: String(person.id), name: person.name } : null);
export function groupNotice(company) {
  const facts = company.facts.filter(
    (fact) =>
      fact.field === 'group' &&
      !/^(?:grupo empresarial:\s*)?(?:n[aã]o(?:\b|\s)|independente\b|sem grupo\b)/i.test(fact.text),
  );
  if (!facts.length) return null;
  const label = (text) =>
    text
      .replace(/^Grupo empresarial:\s*/i, '')
      .replace(/^(?:pertence|pertencente) ao\s*/i, '')
      .split(/[,;.]/)[0]
      .slice(0, 100);
  const variants = [...new Set(facts.map((fact) => normalize(label(fact.text))))];
  return {
    label: label(facts[0].text),
    origin: facts[0].origin,
    registrationPending: !facts.some((fact) => fact.origin === 'organization'),
    conflicting: variants.length > 1,
    citations: facts.flatMap((fact) => fact.citations).slice(0, 6),
  };
}
export function scopeDefaults(snapshot, company) {
  const identity = company.facts.find((fact) => fact.field === 'identity')?.text || '';
  const brand =
    identity.match(/Empresa:\s*([^·]+)/)?.[1].trim() || snapshot.title.split('|')[0].trim();
  const site = identity.match(/Site:\s*([^·\s]+)/)?.[1] || '';
  let domain = '';
  try {
    domain = new URL(site.includes('://') ? site : `https://${site}`).hostname.replace(
      /^www\./,
      '',
    );
  } catch {
    /* no inferred domain */
  }
  return {
    kind: 'brand',
    brands: [brand],
    domains: domain ? [domain] : [],
    product: snapshot.title.split('|').slice(1).join(' | ').trim(),
    maxAgeDays: 30,
  };
}
export function effectiveMaterialCheck(material, state, now = Date.now()) {
  const result = state.materialChecks?.[materialKey(material)];
  if (!result) return null;
  const stale =
    result.scopeHash !== scopeDigest(state.scope) || now - Date.parse(result.checkedAt) > 86400000;
  return { ...result, stale };
}
export function preparationItems({
  snapshot,
  sources,
  record,
  state,
  defaultAssignee,
  now = Date.now(),
}) {
  const company = companyContext(sources),
    group = groupNotice(company);
  const scope = state.scope?.organizationId === company.organizationId ? state.scope : null;
  const materials = dealMaterials(sources).materials;
  const referenceScope = scope || {
    ...scopeDefaults(snapshot, company),
    organizationId: company.organizationId,
  };
  const items = [];
  const add = (item) =>
    items.push({
      ...item,
      fingerprint: digest([item.title, item.found, item.citations || [], item.basis]),
      assignee: defaultAssignee,
    });
  add({
    id: 'scope',
    title: 'Confirmar escopo comercial',
    kind: 'scope',
    found: scope
      ? `${scope.kind === 'group' ? 'Grupo' : 'Marca'}: ${scope.brands.join(', ')} · ${scope.product}`
      : 'Defina quais marcas, domínios e produto esta negociação abrange.',
    automaticStatus: scope ? 'resolved' : 'open',
    citations: group?.citations || [],
    basis: scopeDigest(scope),
  });
  if (group?.registrationPending || group?.conflicting)
    add({
      id: 'group-registration',
      kind: 'issue',
      title: 'Conferir cadastro do grupo',
      found: group.conflicting
        ? 'Há registros de grupo diferentes. Confirme o vínculo correto antes de corrigir o cadastro.'
        : `${group.label} consta nas notas, mas não no campo da organização. Confirme e registre o vínculo no CRM.`,
      citations: group.citations,
      basis: company.organizationId,
    });
  if (group)
    add({
      id: 'contact-scope',
      kind: 'task',
      title: 'Confirmar atuação do contato',
      found:
        'Confirme se o contato representa a marca, o grupo ou uma agência e quais marcas atende.',
      citations: [],
      basis: [
        scopeDigest(scope),
        sources
          .filter((s) => s.kind === 'deal')
          .map((s) => s.text.match(/^(?:Pessoa|person_id|Contato).*$/gm)),
      ],
    });
  for (const [type, pattern, title] of [
    ['report', /relat[oó]rio|monitoria|pescaria|diagn[oó]stico/i, 'Preparar relatório'],
    ['presentation', /ppt|apresenta[çc][aã]o/i, 'Preparar apresentação'],
  ]) {
    if (!materials.some((m) => pattern.test(m.title)))
      add({
        id: `missing-${type}`,
        kind: 'task',
        title,
        found:
          'Link não encontrado nos campos desta versão. Gere ou localize o material do escopo e registre no CRM.',
        citations: [],
        basis: scopeDigest(scope),
      });
  }
  for (const material of materials) {
    const check = effectiveMaterialCheck(material, { ...state, scope: referenceScope }, now);
    const current = check && !check.stale;
    const reasons = current
      ? check.checks.filter((c) => c.status !== 'pass').map((c) => c.message)
      : ['Verifique o conteúdo para este escopo.'];
    add({
      id: materialKey(material),
      kind: current && check.status === 'attention' ? 'issue' : 'material',
      title: `Revisar ${material.title}`,
      found:
        current && check.status === 'compatible'
          ? 'Texto compatível com o escopo. Confirme a revisão comercial e visual antes de usar.'
          : reasons.join(' '),
      citations: [
        { sourceId: material.sourceId, quote: material.quote },
        ...(current
          ? check.checks
              .filter((c) => c.quote)
              .map((c) => ({ sourceId: 'material-verificado', quote: c.quote }))
          : []),
      ],
      materialUrl: material.url,
      basis: [scopeDigest(referenceScope), current ? check.contentHash || check.checks : null],
    });
  }
  for (const item of reviewItems(record))
    add({
      ...item,
      id: `issue:${digest([item.title, item.citations]).slice(0, 24)}`,
      kind: 'issue',
    });
  return {
    company,
    group,
    scope,
    materials: materials.map((m) => ({
      ...m,
      key: materialKey(m),
      validation: effectiveMaterialCheck(m, { ...state, scope: referenceScope }, now),
    })),
    items,
  };
}
export function synchronizeTasks(oldTasks = {}, items, at = new Date().toISOString()) {
  const tasks = Object.fromEntries(
    Object.entries(oldTasks).map(([id, task]) => [id, { ...task, active: false }]),
  );
  for (const item of items) {
    const old = tasks[item.id];
    const changed = old && old.fingerprint !== item.fingerprint;
    tasks[item.id] = {
      ...old,
      ...item,
      assignee: old?.assignee || item.assignee,
      active: true,
      status: item.automaticStatus || (changed ? 'open' : old?.status || 'open'),
      note: old?.note || '',
      dueDate: old?.dueDate || '',
      approval: changed ? null : old?.approval || null,
      draft: changed ? null : old?.draft || null,
      changedEvidence: Boolean(changed || old?.changedEvidence),
      updatedAt: old?.updatedAt || at,
    };
  }
  return tasks;
}
async function readRow(db, user, snapshot) {
  return checked(
    await db
      .from('crm_preparation_workflows')
      .select('*')
      .eq('user_id', user.id)
      .eq('company_id', snapshot.company_id)
      .eq('deal_id', snapshot.deal_id)
      .maybeSingle(),
  );
}
async function saveRow(db, row, state) {
  const saved = checked(
    await db
      .from('crm_preparation_workflows')
      .update({ state, revision: row.revision + 1, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', row.user_id)
      .eq('revision', row.revision)
      .select('*')
      .maybeSingle(),
  );
  if (!saved) throw conflict();
  return saved;
}
export async function preparationAction(
  input,
  { db, user, snapshot, sources, currentDeal, client, validate = validateMaterial },
) {
  const people = (await client.get('/api/v1/users')).data || [];
  const assignees = people
    .filter((p) => p.active_flag !== false && p.active_flag !== 0 && p.id && p.name)
    .map(actor);
  const defaultAssignee =
    assignees.find((p) => p.id === String(idOf(currentDeal.owner_id))) || null;
  const records = checked(
    await db
      .from('crm_answers')
      .select('*')
      .eq('snapshot_id', snapshot.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  );
  const record = records.find((r) => ['overview', 'briefing', 'prospecting'].includes(r.mode));
  let row = await readRow(db, user, snapshot);
  if (!row) {
    const result = await db
      .from('crm_preparation_workflows')
      .insert({
        user_id: user.id,
        company_id: snapshot.company_id,
        deal_id: snapshot.deal_id,
        revision: 0,
        state: { tasks: {}, materialChecks: {}, history: [] },
      })
      .select('*')
      .single();
    if (result.error?.code === '23505') row = await readRow(db, user, snapshot);
    else row = checked(result);
  }
  let state = structuredClone(row.state);
  const readOnly = Boolean(
    state.sourceStartedAt && Date.parse(state.sourceStartedAt) > Date.parse(snapshot.started_at),
  );
  if (readOnly && input.action !== 'preparation')
    throw error('Abra a extração mais recente para atualizar a preparação.');
  const computed = () => preparationItems({ snapshot, sources, record, state, defaultAssignee });
  if (!readOnly) {
    state.tasks = synchronizeTasks(state.tasks, computed().items);
    state.sourceStartedAt = snapshot.started_at;
    state.snapshotId = snapshot.id;
    if (JSON.stringify(state) !== JSON.stringify(row.state)) row = await saveRow(db, row, state);
  }
  if (['saveScope', 'savePreparationTask'].includes(input.action)) {
    if (input.revision !== row.revision) throw conflict();
    const assignee = assignees.find((p) => p.id === input.assigneeId);
    if (!assignee) throw error('Escolha um responsável ativo no Pipedrive.');
    if (input.action === 'saveScope') {
      if (input.scope.kind === 'brand' && input.scope.brands.length !== 1)
        throw error('Para várias marcas, selecione o escopo de grupo.');
      state.scope = {
        ...input.scope,
        brands: [...new Set(input.scope.brands)],
        domains: [
          ...new Set(input.scope.domains.map((d) => d.toLowerCase().replace(/^www\./, ''))),
        ],
        organizationId: computed().company.organizationId,
        assignee,
        confirmedBy: user.email || user.id,
        confirmedAt: new Date().toISOString(),
      };
      state.history = history(
        state,
        {
          action: 'scope',
          text: `Escopo confirmado: ${state.scope.brands.join(', ')}. Responsável: ${assignee.name}.`,
        },
        user,
      );
      state.tasks = synchronizeTasks(state.tasks, computed().items);
      state.tasks.scope.assignee = assignee;
    } else {
      const task = state.tasks[input.taskId];
      if (!task?.active || task.kind === 'scope')
        throw error('Selecione uma pendência ativa. Para o escopo, use Confirmar escopo.');
      if (['resolved', 'dismissed'].includes(input.status) && input.note.trim().length < 10)
        throw error('Registre como a pendência foi conferida antes de concluir ou descartar.');
      if (
        input.approveHelpdesk &&
        (task.kind !== 'issue' ||
          input.note.trim().length < 10 ||
          !['open', 'in_progress'].includes(input.status))
      )
        throw error(
          'Confirme uma ocorrência, com justificativa e status pendente, antes de aprovar o chamado.',
        );
      const draft =
        input.draft ||
        task.draft ||
        draftForReview(
          {
            ...task,
            expected: 'Dados e materiais coerentes com o escopo confirmado.',
            impact: 'Preparação comercial e prospecção da marca correta.',
          },
          snapshot,
        );
      if (`${draft.title}\n${draft.description}`.length > 4000)
        throw error('O rascunho deve ter até 4.000 caracteres.');
      const keepApproval =
        !['resolved', 'dismissed'].includes(input.status) && digest(draft) === digest(task.draft);
      state.tasks[input.taskId] = {
        ...task,
        assignee,
        status: input.status,
        note: input.note.trim(),
        dueDate: input.dueDate,
        draft,
        changedEvidence: false,
        updatedAt: new Date().toISOString(),
        approval: input.approveHelpdesk
          ? {
              by: user.email || user.id,
              at: new Date().toISOString(),
              fingerprint: task.fingerprint,
            }
          : keepApproval
            ? task.approval
            : null,
      };
      state.history = history(
        state,
        {
          taskId: task.id,
          action: input.approveHelpdesk ? 'approve_helpdesk' : 'task',
          text: `${task.title} · ${input.status} · ${assignee.name}`,
          note: input.note.trim(),
        },
        user,
      );
    }
    row = await saveRow(db, row, state);
  }
  if (input.action === 'validateMaterial') {
    const context = computed();
    const material = context.materials.find((m) => m.key === input.materialKey);
    if (!material) throw error('Material não encontrado nos campos desta versão.');
    const referenceScope = context.scope || {
      ...scopeDefaults(snapshot, context.company),
      organizationId: context.company.organizationId,
    };
    const check = await validate(material, referenceScope);
    if (!context.scope) {
      check.scopeUnconfirmed = true;
      check.checks.push({
        key: 'scope',
        status: 'pending',
        message:
          'Comparação com a marca registrada no card. Confirme se a negociação abrange outras marcas do grupo.',
      });
      if (check.status === 'compatible') check.status = 'pending';
    }
    // Do not overwrite an assignment/scope changed while network reads ran.
    row = await readRow(db, user, snapshot);
    state = structuredClone(row.state);
    if (
      scopeDigest(computed().scope || referenceScope) !== check.scopeHash ||
      state.snapshotId !== snapshot.id
    )
      throw conflict();
    state.materialChecks ||= {};
    state.materialChecks[material.key] = check;
    state.tasks = synchronizeTasks(state.tasks, computed().items);
    state.history = history(
      state,
      { action: 'material', text: `${material.title}: ${check.status}.` },
      user,
    );
    row = await saveRow(db, row, state);
  }
  const context = computed();
  return {
    revision: row.revision,
    updatedAt: row.updated_at,
    readOnly,
    sourceStartedAt: state.sourceStartedAt,
    group: context.group,
    scope: context.scope,
    defaults: scopeDefaults(snapshot, context.company),
    materials: context.materials,
    assignees,
    defaultAssignee,
    tasks: Object.values(state.tasks || {}),
    history: state.history || [],
  };
}
