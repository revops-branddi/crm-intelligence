import { createHash } from 'node:crypto';
import { latestOperations } from './operational-reading.js';
const labels = { bb: 'Brand Bidding', bbp: 'Buy Box Protection', gd: 'Golpes Digitais' };
// JSONB may reorder object keys; refreshing the same evidence must not revoke approval.
const stableJson = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const value = (v) =>
  v === null || v === undefined
    ? 'não informado'
    : Array.isArray(v)
      ? v.join(', ') || 'vazio'
      : String(v);
const states = {
  read: 'Consultado',
  unavailable: 'Consulta indisponível',
  not_configured: 'Integração indisponível',
  identity_conflict: 'Vínculo divergente',
  identity_changed: 'Organização alterada; faça nova extração',
  stale_source: 'Fonte desatualizada',
};
export function operationalText(record) {
  const lines = [
    `Fonte: ${record.name}`,
    `Consultado em: ${record.readAt}`,
    `Consulta: ${states[record.status] || record.status}`,
  ];
  if (record.status !== 'read') return lines.join('\n');
  const facts = record.facts;
  if (record.id === 'serp') {
    lines.push(
      `Cobertura da leitura: ${facts.state}; campanhas completas=${facts.coverage.campaigns_complete}; execuções completas=${facts.coverage.executions_complete}`,
    );
    if (!facts.campaigns.length)
      lines.push(
        'Campanhas: nenhuma localizada para este deal; não é uma busca por toda a marca ou grupo.',
      );
    for (const c of facts.campaigns) {
      lines.push(
        `Campanha ${c.id}: status=${value(c.status)}; criada=${value(c.created_at)}; expira=${value(c.expires_at)}; tarefas na fila=${value(c.queued_tasks)}; planilha anexada=${value(c.spreadsheet_attached_at)}.`,
      );
      lines.push(
        `Escopo ${c.id}: termos=${value(c.configuration.keywords)}; cidades=${value(c.configuration.cities)}; dispositivos=${value(c.configuration.devices)}; mecanismos=${value(c.configuration.search_engines)}; limite diário=${value(c.configuration.daily_requests_limit)}.`,
      );
      for (const e of c.executions.slice(0, 3))
        lines.push(
          `Execução ${e.id}: status=${value(e.status)}; início=${value(e.started_at)}; fim=${value(e.finished_at)}; tarefas=${value(e.total_tasks)}; concluídas=${value(e.completed_tasks)}; tentativas com erro=${value(e.error_tasks)}; tarefas planejadas=${value(e.planned_tasks)}; tarefas únicas concluídas=${value(e.queue_completed_tasks)}; falhas definitivas=${value(e.terminal_queue_failures)}; buscas com anúncios=${value(e.tasks_with_ads)}.`,
        );
      if (c.executions.length > 3)
        lines.push(
          `Campanha ${c.id}: resumo das 3 execuções mais recentes de ${c.executions.length} lidas; detalhes preservados.`,
        );
    }
    lines.push(
      'Escopo configurado não comprova cobertura executada. Contadores podem incluir retentativas. Planilha anexada não é relatório comercial publicado. Anúncio capturado não equivale a concorrente qualificado.',
    );
    if (facts.field_issues.length)
      lines.push(`Lacunas de campos: ${facts.field_issues.join(', ')}`);
  } else {
    for (const p of facts.products) {
      lines.push(
        `${labels[p.product]}: consulta=${p.state}; link canônico no card=${p.linked_in_crm ? 'sim' : 'não'}.`,
      );
      for (const r of p.reports)
        lines.push(
          `Relatório ${p.product}/${r.slug}: status=${value(r.status)}; gerado=${value(r.generated_at)}; vinculado no card=${r.linked_in_crm ? 'sim' : 'não'}; anunciantes=${value(r.advertisers_count)}; ameaças de preço=${value(r.price_threats)}; suspeitos GD=${value(r.suspicious)}; URL=${r.url}.`,
        );
    }
    lines.push(
      'Ausência é restrita ao deal ou link canônico. Não exige relatórios de produtos fora do escopo. Data de geração não é data da captura. Pronto não significa revisado ou enviado.',
    );
  }
  return lines.join('\n');
}
export function operationalPreparation(pages, sources, snapshot, scope, now = Date.now()) {
  const records = latestOperations(pages).map((page) => ({
    ...page.payload.data,
    taskKey: page.task_key,
  }));
  const items = [],
    summary = [];
  const add = (record, code, title, found, basis, kind = 'recommendation') => {
    const source = sources.find(
      (s) => s.kind === 'operational' && s.taskKey === record.taskKey && s.part === 0,
    );
    const quote = source?.text
      .split('\n')
      .find((line) => /Campanha |Relatório |consulta=|Consulta:/.test(line));
    const id = `operation:${record.id}:${code}`;
    items.push({
      id,
      kind,
      title,
      found,
      basis,
      requiresApproval: kind === 'recommendation',
      fingerprint: createHash('sha256')
        .update(
          stableJson([
            id,
            title,
            found,
            basis,
            scope?.kind,
            scope?.product,
            scope?.brands,
            scope?.domains,
            scope?.maxAgeDays,
          ]),
        )
        .digest('hex'),
      citations: source && quote ? [{ sourceId: source.id, quote }] : [],
    });
  };
  const productText = `${scope?.product || ''} ${snapshot.title || ''}`;
  const relevant = new Set();
  if (/brand bidding|\bBB\b/i.test(productText)) relevant.add('bb');
  if (/buy box|\bBBP\b/i.test(productText)) relevant.add('bbp');
  if (/golpes|fraude|\bGD\b/i.test(productText)) relevant.add('gd');
  for (const record of records) {
    summary.push({
      source: record.name,
      status: record.status,
      label: states[record.status],
      checkedAt: record.readAt,
    });
    if (record.status !== 'read') {
      add(
        record,
        'source',
        `Conferir ${record.name}`,
        `${states[record.status]}. Atualize a preparação antes de decidir ou solicitar mudanças.`,
        record.status,
        record.status === 'identity_conflict' ? 'issue' : 'task',
      );
      continue;
    }
    if (record.id === 'serp') {
      if (relevant.size && !relevant.has('bb')) continue;
      const c = record.facts.campaigns[0];
      if (!relevant.has('bb') && !c) continue;
      if (!c) {
        add(
          record,
          'missing',
          'Verificar necessidade de monitoria',
          'Nenhuma campanha localizada para este deal. Confira solicitações e o escopo antes de aprovar uma nova monitoria.',
          record.facts.state,
        );
        continue;
      }
      const e = c.executions[0];
      const basis = [
        c.id,
        c.configuration,
        c.expires_at,
        e?.id,
        e?.status,
        e?.terminal_queue_failures,
        e?.planned_tasks,
        e?.queue_completed_tasks,
        record.facts.coverage,
      ];
      if (c.queued_tasks > 0 || ['pending', 'running'].includes(e?.status)) {
        add(
          record,
          'waiting',
          'Acompanhar monitoria em andamento',
          'Há coleta em execução ou tarefas na fila. Aguarde o resultado antes de pedir outra monitoria.',
          basis,
          'task',
        );
      } else if (['failed', 'rejected'].includes(e?.status) || e?.terminal_queue_failures > 0) {
        add(
          record,
          'failure',
          'Revisar falhas da monitoria',
          'Há falhas registradas na execução. Confira a cobertura e a causa antes de repetir ou ampliar a coleta.',
          basis,
          'issue',
        );
      } else if (
        record.facts.state === 'partial' ||
        !e ||
        !e.finished_at ||
        e.planned_tasks === null ||
        e.queue_completed_tasks === null ||
        e.terminal_queue_failures === null ||
        e.planned_tasks === 0 ||
        e.queue_completed_tasks < e.planned_tasks
      ) {
        add(
          record,
          'coverage',
          'Conferir cobertura da monitoria',
          'Os dados disponíveis não comprovam a conclusão de toda a coleta. Verifique as lacunas antes de interpretar poucos achados.',
          basis,
          'task',
        );
      } else if (e.status === 'low_volume' || e.tasks_with_ads === 0) {
        add(
          record,
          'scope',
          'Revisar alcance da monitoria',
          'Poucos achados podem ser válidos. Compare termos de marca, cidades e período com o escopo comercial; proponha ampliação apenas para lacunas justificadas, com limite de consultas e prazo.',
          basis,
        );
      }
    } else {
      for (const p of record.facts.products) {
        if (!relevant.has(p.product) && !p.linked_in_crm && !p.reports.length) continue;
        const r = p.reports.find((r) => r.linked_in_crm) || p.reports[0];
        const basis = [p.product, p.state, r?.slug, r?.status, r?.linked_in_crm, r?.generated_at];
        if (['unavailable', 'partial'].includes(p.state))
          add(
            record,
            `${p.product}:source`,
            `Conferir relatório ${labels[p.product]}`,
            'Consulta indisponível ou parcial. Confirme o estado no Report Engine antes de solicitar geração.',
            basis,
            'task',
          );
        else if (p.state === 'identity_conflict' || p.state === 'unsupported_link')
          add(
            record,
            `${p.product}:identity`,
            `Revisar vínculo do relatório ${labels[p.product]}`,
            'O vínculo do relatório não pôde ser confirmado para este card. Confira marca, produto e organização antes de usar o material.',
            basis,
            'issue',
          );
        else if (!r)
          add(
            record,
            `${p.product}:missing`,
            `Preparar relatório ${labels[p.product]}`,
            p.state === 'gated'
              ? 'O relatório está retido pela regra de publicação. Revise o diagnóstico antes de pedir nova geração.'
              : 'Relatório não localizado ou sem vínculo canônico neste card. Confira a coleta e relatórios existentes antes de aprovar uma geração.',
            basis,
          );
        else if (['pending', 'generating', 'processing'].includes(r.status))
          add(
            record,
            `${p.product}:waiting`,
            `Acompanhar relatório ${labels[p.product]}`,
            'Geração em andamento. Aguarde antes de solicitar novamente.',
            basis,
            'task',
          );
        else if (!['completed', 'ready'].includes(r.status))
          add(
            record,
            `${p.product}:review`,
            `Revisar relatório ${labels[p.product]}`,
            `Status registrado: ${r.status || 'não informado'}. Confira o motivo antes de aprovar nova geração.`,
            basis,
            r.status === 'failed' ? 'issue' : 'recommendation',
          );
        else if (!r.linked_in_crm)
          add(
            record,
            `${p.product}:link`,
            `Vincular relatório ${labels[p.product]}`,
            'Existe relatório pronto associado ao deal, mas o link canônico não está no card. Confira marca e produto antes de atualizar o vínculo.',
            basis,
          );
        else if (
          r.generated_at &&
          now - Date.parse(r.generated_at) > (scope?.maxAgeDays || 30) * 86400000
        )
          add(
            record,
            `${p.product}:age`,
            `Revisar atualidade do relatório ${labels[p.product]}`,
            `A geração tem mais de ${scope?.maxAgeDays || 30} dias. Confira a data das evidências e a necessidade de atualização antes de usar na conversa.`,
            basis,
          );
      }
    }
  }
  return {
    items,
    summary,
    reportChecked: records.some((record) => record.id === 'reports' && record.status === 'read'),
  };
}
