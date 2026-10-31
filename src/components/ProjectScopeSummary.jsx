export function ScopeSummary({ p }) {
  if (p.action === 'prioritize')
    return (
      <dl className="project-scope">
        <div>
          <dt>Coleta existente</dt>
          <dd>{p.campaignId}</dd>
        </div>
        <div>
          <dt>Marca</dt>
          <dd>
            {p.brand} · {p.domains.join(', ')}
          </dd>
        </div>
        <div>
          <dt>Ação</dt>
          <dd>Priorizar até {p.expectedReadyTasks} tarefas já liberadas.</dd>
        </div>
        <div>
          <dt>Efeito</dt>
          <dd>
            Mantém horários, tentativas e limites. Não cria buscas, não cancela a coleta e não
            altera tarefas em execução.
          </dd>
        </div>
      </dl>
    );
  return (
    <dl className="project-scope">
      <div>
        <dt>Marca</dt>
        <dd>{p.brand}</dd>
      </div>
      <div>
        <dt>Domínios</dt>
        <dd>{p.domains?.join(', ') || p.domain}</dd>
      </div>
      <div>
        <dt>Termos</dt>
        <dd>{p.keywords.join(' · ')}</dd>
      </div>
      {p.system === 'serp' ? (
        <>
          <div>
            <dt>Cidades e dispositivos</dt>
            <dd>
              {p.cities.join(' · ')} · {p.devices.join(', ')}
            </dd>
          </div>
          <div>
            <dt>Plano</dt>
            <dd>
              {p.keywords.length * p.cities.length * p.devices.length * p.rounds} buscas ·{' '}
              {p.rounds} rodada(s) · prazo de {p.windowHours}h
            </dd>
          </div>
          <div>
            <dt>Limite total</dt>
            <dd>{p.maxRequests} consultas, incluindo novas tentativas. Sem renovação.</dd>
          </div>
          <div>
            <dt>Exceção de etapa</dt>
            <dd>
              {p.allowStageException
                ? 'Aprovada para a etapa atual'
                : 'Somente etapas permitidas pelo SERP'}
            </dd>
          </div>
        </>
      ) : (
        <>
          <div>
            <dt>Relatório</dt>
            <dd>
              {p.mode === 'generate' ? 'Gerar' : 'Reprocessar'} · {p.slug}
            </dd>
          </div>
          <div>
            <dt>Evidências</dt>
            <dd>
              Últimos {p.lookbackDays} dias · {p.campaignIds.join(', ')}
            </dd>
          </div>
          <div>
            <dt>Regra de atualização</dt>
            <dd>
              Prioriza mais anunciantes; em empate, mais anúncios. Preserva a versão anterior se o
              novo resultado perder volume dentro da janela.
            </dd>
          </div>
          <div>
            <dt>Publicação</dt>
            <dd>O link público pode ser atualizado. Sem envio ao lead ou alteração da etapa.</dd>
          </div>
        </>
      )}
    </dl>
  );
}
