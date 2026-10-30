import { useEffect, useState } from 'react';
import { Radar, FileChartColumn, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '../services/api';
import { ScopeForm } from './PreparationWorkflow';
import { DetailSheet } from './DetailSheet';
import { reportCampaigns, reportKeywords } from '../services/report-evidence';
import './project-workspace.css';
const names = { serp: 'SERP Monitor', reports: 'Report Engine' };
const labels = {
  draft: 'Aguardando aprovação',
  dispatching: 'Enviando pedido',
  accepted: 'Recebido pelo projeto',
  running: 'Em execução',
  completed: 'Concluído',
  partial: 'Resultado parcial',
  preserved: 'Versão anterior mantida',
  failed: 'Não iniciado',
  uncertain: 'Confirmando resultado',
};
const pending = (s) => ['dispatching', 'accepted', 'running', 'uncertain'].includes(s);
const split = (s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const date = (s) => (s ? new Date(s).toLocaleString('pt-BR') : 'Não informado');
const sourceStatus = (s) =>
  ({
    completed: 'Concluída',
    ready: 'Pronto',
    running: 'Em execução',
    pending: 'Na fila',
    generating: 'Gerando',
    failed: 'Falhou',
    review_needed: 'Revisão necessária',
    low_volume: 'Poucos resultados',
  })[s] ||
  s ||
  'Não informado';
function Facts({ system, data }) {
  const op = data.operations[system];
  if (op?.status !== 'read')
    return (
      <p className="briefing-note">
        Não foi possível confirmar os dados deste projeto. Atualize a consulta antes de decidir.
      </p>
    );
  if (system === 'serp')
    return (
      <div className="project-facts">
        {op.facts.campaigns.length ? (
          op.facts.campaigns.map((c) => (
            <article className="project-fact" key={c.id}>
              <h4>{c.created_at ? `Coleta de ${date(c.created_at)}` : 'Coleta registrada'}</h4>
              <p>{c.configuration.keywords?.join(' · ') || 'Termos não informados'}</p>
              <p>
                {c.configuration.cities?.length ?? '—'} cidades ·{' '}
                {c.configuration.devices?.length ?? '—'} dispositivos
              </p>
              <details>
                <summary>Ver configuração completa</summary>
                <p>{c.id}</p>
                <p>{c.configuration.cities?.join(' · ')}</p>
                <p>{c.configuration.devices?.join(', ')}</p>
              </details>
              <dl>
                <div>
                  <dt>Na fila</dt>
                  <dd>{c.queued_tasks ?? '—'}</dd>
                </div>
                <div>
                  <dt>Última execução</dt>
                  <dd>{sourceStatus(c.executions[0]?.status)}</dd>
                </div>
                <div>
                  <dt>Buscas concluídas</dt>
                  <dd>
                    {c.executions[0]?.queue_completed_tasks ?? '—'} /{' '}
                    {c.executions[0]?.planned_tasks ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt>Buscas com anúncios</dt>
                  <dd>{c.executions[0]?.tasks_with_ads ?? '—'}</dd>
                </div>
              </dl>
            </article>
          ))
        ) : (
          <p>Nenhuma campanha localizada para este deal.</p>
        )}
      </div>
    );
  return (
    <div className="project-facts">
      {op.facts.products.map((p) => (
        <article className="project-fact" key={p.product}>
          <h4>
            {{ bb: 'Brand Bidding', bbp: 'Buy Box Protection', gd: 'Golpes Digitais' }[p.product]}
          </h4>
          {p.reports.length ? (
            p.reports.map((r) => (
              <div key={r.slug}>
                <p>
                  {r.brand || r.slug} · {sourceStatus(r.status)}
                </p>
                <p>
                  Geração: {date(r.generated_at)} ·{' '}
                  {r.linked_in_crm ? 'Link no card' : 'Sem vínculo no card'}
                </p>
                {p.product === 'bb' && (
                  <p>Anunciantes no relatório: {r.advertisers_count ?? 'Não informado'}</p>
                )}
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  Ver relatório
                </a>
              </div>
            ))
          ) : (
            <p>
              {p.state === 'not_found' || p.state === 'not_linked'
                ? 'Relatório não localizado para este deal.'
                : `Consulta: ${p.state}`}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
function ScopeSummary({ p }) {
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
function Proposal({ system, data, onPrepare, onConfirmScope, busy }) {
  const camps = data.operations.serp?.facts?.campaigns || [];
  const reports =
    data.operations.reports?.facts?.products.find((p) => p.product === 'bb')?.reports || [];
  const first = camps[0],
    report = reports.find((r) => r.linked_in_crm) || reports[0];
  const scope = data.scope || data.defaults || { brands: [], domains: [] };
  const initialCampaigns = reportCampaigns(camps, 30);
  const [values, setForm] = useState({
    brand: scope?.brands?.[0] || '',
    domain: scope?.domains?.[0] || '',
    keywords:
      system === 'reports'
        ? reportKeywords(initialCampaigns).join(', ')
        : first?.configuration.keywords?.join(', ') || '',
    cities: first?.configuration.cities?.slice(0, 3).join('\n') || 'São Paulo,Brazil',
    devices: 'both',
    rounds: 2,
    windowHours: 12,
    maxRequests: 100,
    allowStageException: false,
    campaignIds: initialCampaigns.map((c) => c.id),
    slug: report?.slug || '',
    lookbackDays: 30,
    assigneeId: data.defaultAssigneeId,
    reason: '',
  });
  const form = {
    ...values,
    brand: scope.brands.includes(values.brand) ? values.brand : scope.brands[0] || '',
    domain: scope.domains.includes(values.domain) ? values.domain : scope.domains[0] || '',
  };
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const common = { system, brand: form.brand, keywords: split(form.keywords) };
    const params =
      system === 'serp'
        ? {
            ...common,
            domains: [form.domain],
            cities: form.cities
              .split('\n')
              .map((c) => c.trim())
              .filter(Boolean),
            devices: form.devices === 'both' ? ['desktop', 'mobile'] : [form.devices],
            rounds: Number(form.rounds),
            windowHours: Number(form.windowHours),
            maxRequests: Number(form.maxRequests),
            allowStageException: form.allowStageException,
          }
        : {
            ...common,
            domain: form.domain,
            slug: form.slug || `crm-${data.dealId}-bb`,
            mode: reports.length ? 'regenerate' : 'generate',
            lookbackDays: Number(form.lookbackDays),
            campaignIds: form.campaignIds,
          };
    try {
      await onPrepare(params, form.assigneeId, form.reason);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <form onSubmit={submit} className="project-proposal">
      {!data.scope?.confirmedAt && (
        <div className="briefing-note">
          <p>
            Você pode personalizar os parâmetros abaixo. Confirme o escopo para salvar a proposta;
            nenhuma ação será executada nesta etapa.
          </p>
          <button type="button" className="secondary" disabled={busy} onClick={onConfirmScope}>
            Confirmar escopo aqui
          </button>
        </div>
      )}
      <div className="project-form-grid">
        <label>
          Marca
          <select value={form.brand} onChange={(e) => change('brand', e.target.value)}>
            {scope.brands.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Domínio
          <select value={form.domain} onChange={(e) => change('domain', e.target.value)}>
            {scope.domains.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {system === 'reports' && (
          <>
            <details className="project-campaigns full">
              <summary>Campanhas de origem · {form.campaignIds.length} selecionada(s)</summary>
              <p>
                Combine coletas do período para ampliar as evidências. O relatório conta anunciantes
                distintos, sem somar duplicatas entre campanhas.
              </p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const selected = reportCampaigns(camps, form.lookbackDays);
                  setForm((f) => ({
                    ...f,
                    campaignIds: selected.map((c) => c.id),
                    keywords: reportKeywords(selected).join(', '),
                  }));
                }}
              >
                Selecionar coletas concluídas do período
              </button>
              {camps.map((c) => (
                <label className="project-consent" key={c.id}>
                  <input
                    type="checkbox"
                    checked={form.campaignIds.includes(c.id)}
                    disabled={
                      c.queued_tasks !== 0 ||
                      c.executions.some((e) => ['pending', 'running'].includes(e.status))
                    }
                    onChange={(e) =>
                      setForm((f) => {
                        const ids = e.target.checked
                          ? [...f.campaignIds, c.id]
                          : f.campaignIds.filter((id) => id !== c.id);
                        return {
                          ...f,
                          campaignIds: ids,
                          keywords: reportKeywords(
                            camps.filter((camp) => ids.includes(camp.id)),
                          ).join(', '),
                        };
                      })
                    }
                  />
                  <span>
                    {c.id} · {date(c.executions[0]?.finished_at)}
                    {c.queued_tasks > 0 ? ' · Coleta pendente' : ''}
                  </span>
                </label>
              ))}
            </details>
            <label className="full">
              Relatório
              {reports.length ? (
                <select value={form.slug} onChange={(e) => change('slug', e.target.value)}>
                  {reports.map((r) => (
                    <option key={r.slug}>{r.slug}</option>
                  ))}
                </select>
              ) : (
                <input value={`Novo relatório deste deal`} readOnly />
              )}
            </label>
          </>
        )}
        <label className="full">
          Palavras-chave exatas, separadas por vírgula
          <textarea
            required
            maxLength={1000}
            value={form.keywords}
            onChange={(e) => change('keywords', e.target.value)}
          />
        </label>
        {system === 'serp' ? (
          <>
            <label className="full">
              Cidades, uma por linha (até 10)
              <textarea
                required
                maxLength={1000}
                value={form.cities}
                onChange={(e) => change('cities', e.target.value)}
              />
            </label>
            <label>
              Dispositivos
              <select value={form.devices} onChange={(e) => change('devices', e.target.value)}>
                <option value="both">Desktop e mobile</option>
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </select>
            </label>
            <label>
              Rodadas
              <select value={form.rounds} onChange={(e) => change('rounds', e.target.value)}>
                <option value="1">1 rodada</option>
                <option value="2">2 rodadas</option>
              </select>
            </label>
            <label>
              Prazo da coleta
              <select
                value={form.windowHours}
                onChange={(e) => change('windowHours', e.target.value)}
              >
                <option value="1">1 hora · coleta rápida</option>
                <option value="12">12 horas · distribuída</option>
                <option value="24">24 horas · distribuída</option>
              </select>
            </label>
            <label>
              Teto total de consultas
              <input
                type="number"
                min="1"
                max="500"
                required
                value={form.maxRequests}
                onChange={(e) => change('maxRequests', e.target.value)}
              />
            </label>
            <label className="project-consent full">
              <input
                type="checkbox"
                checked={form.allowStageException}
                onChange={(e) => change('allowStageException', e.target.checked)}
              />
              <span>
                Permitir esta coleta manual na etapa atual, mesmo fora do fluxo automático.
              </span>
            </label>
          </>
        ) : (
          <label>
            Janela das evidências (dias)
            <input
              type="number"
              min="1"
              max="365"
              required
              value={form.lookbackDays}
              onChange={(e) => change('lookbackDays', e.target.value)}
            />
          </label>
        )}
        <label>
          Responsável
          <select
            required
            value={form.assigneeId}
            onChange={(e) => change('assigneeId', e.target.value)}
          >
            <option value="">Selecione</option>
            {data.assignees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          Objetivo deste reprocessamento
          <textarea
            required
            minLength={10}
            maxLength={500}
            value={form.reason}
            onChange={(e) => change('reason', e.target.value)}
            placeholder="Qual lacuna esta ação deve resolver?"
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="briefing-note">
          {error}
        </p>
      )}
      <div className="project-plan-summary" role="status">
        {system === 'serp'
          ? `${split(form.keywords).length} termos × ${form.cities.split('\n').filter((c) => c.trim()).length} cidades × ${form.devices === 'both' ? 2 : 1} dispositivos × ${form.rounds} rodadas = ${split(form.keywords).length * form.cities.split('\n').filter((c) => c.trim()).length * (form.devices === 'both' ? 2 : 1) * Number(form.rounds)} buscas planejadas. Teto: ${form.maxRequests} consultas, incluindo tentativas.`
          : `Brand Bidding · últimos ${form.lookbackDays} dias · ${split(form.keywords).length} termos · ${form.campaignIds.length} campanha(s) selecionada(s).`}
      </div>
      <p className="briefing-muted">
        {system === 'serp'
          ? 'A coleta usa uma campanha própria, com limite e prazo. Não dispara relatório, mensagem ou mudança de etapa.'
          : 'A atualização prioriza o número de anunciantes e usa o volume de anúncios como desempate. Um resultado menor preserva a versão anterior válida. Você pode ajustar campanhas, termos e período antes de cada aprovação.'}
      </p>
      <button
        className="primary"
        disabled={
          busy ||
          !data.enabled[system] ||
          !data.scope?.confirmedAt ||
          (system === 'reports' && !form.campaignIds.length)
        }
      >
        {busy ? 'Conferindo dados…' : 'Revisar aprovação individual'}
      </button>
      {!data.enabled[system] && <p>Execução indisponível nesta conta.</p>}
    </form>
  );
}
export function ProjectWorkspace({ snapshot, system, onOpen, onBack, onComplete }) {
  const [data, setData] = useState(null),
    [job, setJob] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [tab, setTab] = useState('analysis'),
    [scopeData, setScopeData] = useState(null),
    [scopeError, setScopeError] = useState('');
  const openScope = async () => {
    setBusy(true);
    setScopeError('');
    try {
      setScopeData(await apiRequest('preparation', { snapshotId: snapshot.id }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveScope = async (action, input) => {
    setBusy(true);
    setScopeError('');
    try {
      const result = await apiRequest(action, { snapshotId: snapshot.id, ...input });
      setData((d) => ({ ...d, scope: result.scope }));
      setScopeData(null);
    } catch (e) {
      if (e.code === 'workflow_conflict') {
        try {
          setScopeData(await apiRequest('preparation', { snapshotId: snapshot.id }));
        } catch {
          /* preserve the entered fields */
        }
        setScopeError(
          'A preparação foi atualizada. Seus campos foram mantidos; revise e salve novamente.',
        );
      } else setScopeError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!system) return;
    let live = true;
    apiRequest('projectContext', { snapshotId: snapshot.id })
      .then((d) => {
        if (live) setData({ ...d, dealId: snapshot.deal_id });
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [snapshot.id, snapshot.deal_id, system]);
  useEffect(() => {
    if (!job || !pending(job.status)) return;
    let live = true;
    const timer = setInterval(() => {
      apiRequest('projectExecution', { snapshotId: snapshot.id, executionId: job.id })
        .then(({ execution }) => {
          if (live) {
            setJob(execution);
            if (!pending(execution.status)) {
              apiRequest('projectContext', { snapshotId: snapshot.id, refresh: true })
                .then((d) => {
                  if (live) setData({ ...d, dealId: snapshot.deal_id });
                  if (['completed', 'partial', 'preserved'].includes(execution.status))
                    onComplete?.();
                })
                .catch(() => {});
            }
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 12000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [job, snapshot.id, snapshot.deal_id, onComplete]);
  const updateJob = (execution) => {
    setJob(execution);
    setData(
      (d) =>
        d && {
          ...d,
          executions: [execution, ...d.executions.filter((e) => e.id !== execution.id)],
        },
    );
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const d = await apiRequest('projectContext', { snapshotId: snapshot.id, refresh: true });
      setData({ ...d, dealId: snapshot.deal_id });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const prepare = async (parameters, assigneeId, reason) => {
    setBusy(true);
    try {
      const r = await apiRequest('prepareProjectAction', {
        snapshotId: snapshot.id,
        parameters,
        assigneeId,
        reason,
      });
      updateJob(r.execution);
      setConsent(false);
      setTab('execution');
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!consent || !job) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiRequest('approveProjectAction', {
        snapshotId: snapshot.id,
        executionId: job.id,
        approve: true,
      });
      updateJob(r.execution);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!system)
    return (
      <section className="project-launchers" aria-label="Ferramentas dos projetos">
        {['serp', 'reports'].map((s) => (
          <button className="project-launch" key={s} onClick={() => onOpen(s)}>
            {s === 'serp' ? <Radar size={20} /> : <FileChartColumn size={20} />}
            <span>
              <strong>{names[s]}</strong>
              <small>
                {s === 'serp' ? 'Cobertura e coleta personalizada' : 'Evidências e reprocessamento'}
              </small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        ))}
      </section>
    );
  return (
    <section className="project-workspace">
      <header className="project-heading">
        <div>
          <button className="text-action" onClick={onBack}>
            <ArrowLeft size={16} /> Voltar ao briefing
          </button>
          <h2>{names[system]}</h2>
          <p>
            {snapshot.title} · Deal #{snapshot.deal_id}
          </p>
        </div>
        <button className="secondary" onClick={refresh} disabled={busy}>
          <RefreshCw size={16} /> Atualizar dados
        </button>
      </header>
      {error && (
        <p role="alert" className="briefing-note">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">Consultando projetos…</p>
      ) : (
        <>
          <nav className="briefing-subnav" aria-label="Ferramentas do projeto">
            {[
              ['analysis', 'Análise'],
              ['custom', 'Reprocessar'],
              ['execution', 'Aprovação e execução'],
            ].map(([id, label]) => (
              <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          {tab === 'analysis' && (
            <>
              <div className="project-recommendations">
                <h3>Orientação para este deal</h3>
                {(data.recommendations || [])
                  .filter((r) => r.id.startsWith(`operation:${system}:`))
                  .map((r) => (
                    <div key={r.id}>
                      <strong>{r.title}</strong>
                      <p>{r.found}</p>
                    </div>
                  ))}
                {!(data.recommendations || []).some((r) =>
                  r.id.startsWith(`operation:${system}:`),
                ) && (
                  <p>
                    Nenhuma mudança automática recomendada pela consulta atual. Você pode
                    personalizar uma ação e revisar o escopo antes de aprovar.
                  </p>
                )}
              </div>
              <Facts system={system} data={data} />
              <button
                className="primary"
                onClick={() => {
                  setTab('custom');
                  setJob(null);
                  setConsent(false);
                }}
              >
                Personalizar reprocessamento
              </button>
            </>
          )}
          {tab === 'custom' && (
            <Proposal
              key={system}
              system={system}
              data={data}
              onPrepare={prepare}
              onConfirmScope={openScope}
              busy={busy}
            />
          )}{' '}
          {tab === 'execution' &&
            (job ? (
              <article className="project-approval">
                <div className="project-heading">
                  <h3>{labels[job.status]}</h3>
                  <span>{job.assignee.name}</span>
                </div>
                <p>{job.reason}</p>
                <ScopeSummary p={job.parameters} />
                {job.status === 'draft' ? (
                  <>
                    <p className="briefing-muted">
                      Proposta salva. Revise e aprove até {date(job.expires_at)}. Mudanças nas
                      fontes exigem nova revisão.
                    </p>
                    <label className="project-consent">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>Aprovo somente esta ação, com os parâmetros e efeitos descritos.</span>
                    </label>
                    <button className="primary" disabled={!consent || busy} onClick={approve}>
                      {busy ? 'Registrando aprovação…' : `Aprovar e executar no ${names[system]}`}
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setConsent(false);
                        setTab('custom');
                      }}
                    >
                      Revisar parâmetros
                    </button>
                  </>
                ) : (
                  <div className="project-result" role="status">
                    <CheckCircle2 size={20} />
                    <div>
                      <strong>{labels[job.status]}</strong>
                      <p>
                        {job.result?.message ||
                          'Pedido registrado. O acompanhamento não inicia outra execução.'}
                      </p>
                      {job.result?.planned !== undefined && (
                        <p>
                          {job.result.completed} / {job.result.planned} buscas concluídas ·{' '}
                          {job.result.consumed} / {job.result.maxRequests} consultas consumidas
                        </p>
                      )}
                      <small>
                        Aprovado por {job.approved_by} · {date(job.approved_at)}
                      </small>
                      <button
                        className="text-action"
                        onClick={async () => {
                          try {
                            const r = await apiRequest('projectExecution', {
                              snapshotId: snapshot.id,
                              executionId: job.id,
                            });
                            updateJob(r.execution);
                            if (
                              pending(job.status) &&
                              ['completed', 'partial', 'preserved'].includes(r.execution.status)
                            ) {
                              await refresh();
                              onComplete?.();
                            }
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        Consultar execução existente
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ) : (
              <p>Escolha uma ação salva ou personalize um reprocessamento.</p>
            ))}
          {scopeData && (
            <DetailSheet
              title="Escopo da negociação"
              subtitle="Confirmar antes de preparar a execução"
              onClose={() => {
                if (!busy) setScopeData(null);
              }}
            >
              {scopeError && (
                <p role="alert" className="briefing-note">
                  {scopeError}
                </p>
              )}
              <ScopeForm data={scopeData} busy={busy} onSave={saveScope} />
            </DetailSheet>
          )}
          <details className="project-history">
            <summary>Propostas salvas e histórico</summary>
            {data.executions
              .filter((e) => e.system === system)
              .map((e) => (
                <button
                  key={e.id}
                  className="project-history-row"
                  onClick={() => {
                    setJob(e);
                    setTab('execution');
                    setConsent(false);
                  }}
                >
                  <span>
                    {date(e.created_at)} · {e.assignee.name}
                  </span>
                  <strong>{labels[e.status]}</strong>
                </button>
              ))}
          </details>
        </>
      )}
    </section>
  );
}
