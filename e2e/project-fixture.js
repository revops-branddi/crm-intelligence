export function projectFixture({
  scopeConfirmed = true,
  multipleCampaigns = false,
  queueDetail,
  mixedCampaigns = false,
  reportStatus = 'completed',
  reportResult = { previousAdvertisers: 1, publishedAdvertisers: 4 },
  reportMetadataCount,
} = {}) {
  const jobs = [];
  const campaign = {
    id: 'synthetic-c1',
    queued_tasks: 0,
    configuration: {
      keywords: ['lume'],
      cities: ['São Paulo,Brazil', 'Campinas,Brazil'],
      devices: ['desktop'],
    },
    executions: [
      {
        status: 'completed',
        finished_at: new Date().toISOString(),
        planned_tasks: 12,
        queue_completed_tasks: 12,
        terminal_queue_failures: 0,
        tasks_with_ads: 1,
      },
    ],
  };
  const context = {
    scope: {
      brands: ['Lume'],
      domains: ['lume.example.test'],
      confirmedAt: '2026-10-30T10:00:00Z',
    },
    assignees: [
      { id: '9', name: 'SDR Teste' },
      { id: '10', name: 'Closer Teste' },
    ],
    defaultAssigneeId: '9',
    enabled: { serp: true, reports: true },
    operations: {
      serp: { status: 'read', facts: { campaigns: [campaign] } },
      reports: {
        status: 'read',
        facts: {
          products: [
            {
              product: 'bb',
              state: 'found',
              reports: [
                {
                  slug: 'lume',
                  brand: 'Lume',
                  domain: 'lume.example.test',
                  advertisers_count: 1,
                  status: 'completed',
                  linked_in_crm: true,
                  generated_at: '2026-10-20T12:00:00Z',
                  url: 'https://report.branddi.com/report/lume',
                },
              ],
            },
          ],
        },
      },
    },
  };
  if (queueDetail) {
    campaign.queue_detail = queueDetail;
    campaign.queued_tasks =
      queueDetail.ready_tasks +
      queueDetail.scheduled_tasks +
      queueDetail.processing_tasks +
      queueDetail.unknown_schedule_tasks;
  }
  context.defaults = { brands: ['Lume'], domains: ['lume.example.test'] };
  if (multipleCampaigns)
    context.operations.serp.facts.campaigns.push({
      ...campaign,
      id: 'synthetic-c2',
      configuration: { ...campaign.configuration, keywords: ['lume promoção'] },
    });
  if (!scopeConfirmed) context.scope = null;
  if (mixedCampaigns) {
    const extra = (id, days, patch = {}) => ({
      ...campaign,
      id,
      ...patch,
      executions: [
        {
          ...campaign.executions[0],
          finished_at: new Date(Date.now() - days * 86400000).toISOString(),
          ...patch.execution,
        },
      ],
    });
    context.operations.serp.facts.campaigns.push(
      extra('older-valid', 14),
      extra('too-old', 45),
      extra('queued', 1, { queued_tasks: 2 }),
      extra('running', 1, { execution: { status: 'running' } }),
      extra('incomplete', 1, { execution: { queue_completed_tasks: 2 } }),
    );
  }
  return function (request) {
    if (request.action === 'projectContext') return { ...context, executions: [...jobs] };
    if (request.action === 'prepareProjectAction') {
      const j = {
        id: `eeeeeeee-eeee-4eee-8eee-${String(jobs.length + 1).padStart(12, '0')}`,
        system: request.parameters.system,
        status: 'draft',
        parameters: request.parameters,
        assignee: context.assignees.find((p) => p.id === request.assigneeId),
        reason: request.reason,
        created_at: new Date().toISOString(),
      };
      jobs.push(j);
      return { execution: j };
    }
    const j = jobs.find((j) => j.id === request.executionId);
    if (!j) throw new Error('Pedido não encontrado');
    if (request.action === 'approveProjectAction') {
      j.status = 'running';
      j.approved_by = 'Pessoa de teste';
      j.approved_at = new Date().toISOString();
      j.result = { message: 'Pedido recebido pelo projeto.' };
    }
    if (request.action === 'projectExecution') {
      j.status = j.system === 'reports' ? reportStatus : 'completed';
      j.result = {
        message: 'Resultado confirmado no projeto. Briefing pode ser atualizado.',
        ...(j.system === 'reports' && {
          result: {
            ...reportResult,
            generatedAt: new Date().toISOString(),
            lookbackDays: j.parameters.lookbackDays,
            campaignIds: j.parameters.campaignIds,
          },
        }),
      };
      if (j.system === 'reports' && Number.isInteger(reportMetadataCount)) {
        const r = context.operations.reports.facts.products[0].reports[0];
        r.generated_at = j.result.result.generatedAt;
        r.advertisers_count = reportMetadataCount;
      }
    }
    return { execution: j };
  };
}
