export function projectFixture({ scopeConfirmed = true, multipleCampaigns = false } = {}) {
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
  context.defaults = { brands: ['Lume'], domains: ['lume.example.test'] };
  if (multipleCampaigns)
    context.operations.serp.facts.campaigns.push({
      ...campaign,
      id: 'synthetic-c2',
      configuration: { ...campaign.configuration, keywords: ['lume promoção'] },
    });
  if (!scopeConfirmed) context.scope = null;
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
      j.status = 'completed';
      j.result = { message: 'Resultado confirmado no projeto. Briefing pode ser atualizado.' };
    }
    return { execution: j };
  };
}
