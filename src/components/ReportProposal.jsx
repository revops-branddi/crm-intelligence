import { ReportBaseline } from './ReportBaseline';
import { reportBaseline } from '../services/report-baseline';
import { useState } from 'react';
import { reportCampaigns, reportKeywords, completedCaptures } from '../services/report-evidence';
import { ScopeSummary } from './ProjectScopeSummary';

const date = (value) => new Date(value).toLocaleString('pt-BR');
const limit = 20;

export function ReportProposal({ data, draft, onPrepare, onConfirmScope, busy }) {
  const campaigns = data.operations.serp?.facts?.campaigns || [];
  const reports =
    data.operations.reports?.facts?.products.find((p) => p.product === 'bb')?.reports || [];
  const scope = data.scope || data.defaults || { brands: [], domains: [] };
  const [slug, setSlug] = useState(
    draft?.parameters.slug || (reports.find((r) => r.linked_in_crm) || reports[0])?.slug || '',
  );
  const [brand, setBrand] = useState(draft?.parameters.brand || scope.brands[0] || '');
  const [domain, setDomain] = useState(draft?.parameters.domain || scope.domains[0] || '');
  const [days, setDays] = useState(draft?.parameters.lookbackDays || 30);
  // null selects all eligible evidence; explicit choices survive period changes.
  const [campaignIds, setCampaignIds] = useState(draft?.parameters.campaignIds || null);
  const [termSelection, setTermSelection] = useState(draft?.parameters.keywords || null);
  const [assigneeId, setAssigneeId] = useState(draft?.assignee.id || data.defaultAssigneeId);
  const [reason, setReason] = useState(
    draft?.reason || 'Atualizar o relatório com as coletas concluídas do período.',
  );
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const report =
    reports.find((r) => r.slug === slug) || reports.find((r) => r.linked_in_crm) || reports[0];
  const eligible = reportCampaigns(campaigns, days);
  const selected = eligible
    .filter((c) => campaignIds === null || campaignIds.includes(c.id))
    .slice(0, limit);
  const availableTerms = reportKeywords(selected);
  const terms = availableTerms
    .filter((k) => termSelection === null || termSelection.includes(k))
    .slice(0, limit);
  const parameters = {
    system: 'reports',
    brand: report?.brand || (scope.brands.includes(brand) ? brand : scope.brands[0]) || '',
    domain: report?.domain || (scope.domains.includes(domain) ? domain : scope.domains[0]) || '',
    slug: report?.slug || `crm-${data.dealId}-bb`,
    mode: report ? 'regenerate' : 'generate',
    lookbackDays: Number(days),
    keywords: terms,
    campaignIds: selected.map((c) => c.id),
  };
  const blocked =
    busy ||
    !data.enabled.reports ||
    !data.scope?.confirmedAt ||
    !selected.length ||
    !terms.length ||
    !parameters.brand ||
    !parameters.domain ||
    !Number.isInteger(Number(days)) ||
    Number(days) < 1 ||
    Number(days) > 365;
  const submit = async (event) => {
    event.preventDefault();
    if (blocked) return;
    setError('');
    if (!review) {
      setReview(true);
      return;
    }
    try {
      await onPrepare(parameters, assigneeId, reason);
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <form className="project-proposal report-proposal" onSubmit={submit}>
      <header className="report-identity">
        <div>
          <strong>{parameters.brand || 'Marca a confirmar'}</strong>
          <span>{parameters.domain || 'Domínio a confirmar'}</span>
        </div>
        <div>
          <small>Brand Bidding</small>
          <span>{report?.slug || 'Novo relatório deste deal'}</span>
        </div>
      </header>
      {!data.scope?.confirmedAt && (
        <div className="briefing-note">
          <p>Confirme o escopo para salvar a proposta.</p>
          <button type="button" className="secondary" disabled={busy} onClick={onConfirmScope}>
            Confirmar escopo aqui
          </button>
        </div>
      )}
      {review ? (
        <>
          <h3>Preparar aprovação individual</h3>
          <ScopeSummary p={parameters} />
          <div className="project-form-grid">
            <label>
              Responsável
              <select required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Selecione</option>
                {data.assignees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full">
              Justificativa da atualização
              <textarea
                required
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>
          <p className="briefing-muted">
            A justificativa registra o motivo da ação. A proposta salva ainda precisa da sua
            aprovação para executar.
          </p>
        </>
      ) : (
        <>
          <div className="project-form-grid report-period">
            {reports.length > 1 && (
              <label className="full">
                Relatório
                <select value={parameters.slug} onChange={(e) => setSlug(e.target.value)}>
                  {reports.map((r) => (
                    <option key={r.slug}>{r.slug}</option>
                  ))}
                </select>
              </label>
            )}
            {!report && scope.brands.length > 1 && (
              <label>
                Marca
                <select value={parameters.brand} onChange={(e) => setBrand(e.target.value)}>
                  {scope.brands.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            {!report && scope.domains.length > 1 && (
              <label>
                Domínio
                <select value={parameters.domain} onChange={(e) => setDomain(e.target.value)}>
                  {scope.domains.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Período das evidências (dias)
              <input
                required
                type="number"
                min="1"
                max="365"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </label>
            <div className="report-selection-summary" role="status">
              <strong>
                {selected.length}{' '}
                {selected.length === 1 ? 'coleta selecionada' : 'coletas selecionadas'}
              </strong>
              <span>
                {terms.length} {terms.length === 1 ? 'termo' : 'termos'} · últimos {days || '—'}{' '}
                dias
              </span>
            </div>
          </div>
          <fieldset className="report-collections">
            <legend>Coletas concluídas</legend>
            <div className="report-section-heading">
              <small>
                {eligible.length} {eligible.length === 1 ? 'disponível' : 'disponíveis'} neste
                período
              </small>
              {eligible.length > 0 && (
                <div className="report-selection-actions">
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => setCampaignIds(null)}
                  >
                    Selecionar todas
                  </button>
                  <button type="button" className="text-action" onClick={() => setCampaignIds([])}>
                    Limpar seleção
                  </button>
                </div>
              )}
            </div>
            {eligible.length ? (
              <div className="report-collection-list">
                {eligible.map((c) => {
                  const checked = parameters.campaignIds.includes(c.id);
                  const finished = completedCaptures(c, days)
                    .map((e) => e.finished_at)
                    .sort()
                    .at(-1);
                  return (
                    <label key={c.id} className="report-collection">
                      <input
                        type="checkbox"
                        aria-label={`Coleta de ${date(finished)} · ${c.id}`}
                        checked={checked}
                        disabled={!checked && selected.length >= limit}
                        onChange={(e) =>
                          setCampaignIds(
                            e.target.checked
                              ? [...parameters.campaignIds, c.id]
                              : parameters.campaignIds.filter((id) => id !== c.id),
                          )
                        }
                      />
                      <span>
                        <strong>{date(finished)}</strong>
                        <small>{c.configuration.keywords?.join(' · ')}</small>
                      </span>
                      <small>
                        {c.configuration.cities?.length ?? '—'}{' '}
                        {c.configuration.cities?.length === 1 ? 'cidade' : 'cidades'} ·{' '}
                        {c.configuration.devices?.length ?? '—'}{' '}
                        {c.configuration.devices?.length === 1 ? 'dispositivo' : 'dispositivos'}
                      </small>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="report-empty">
                Nenhuma coleta concluída neste período. Amplie o período ou aguarde a conclusão no
                SERP Monitor.
              </p>
            )}
            {campaigns.length > eligible.length && (
              <small>
                {campaigns.length - eligible.length}{' '}
                {campaigns.length - eligible.length === 1 ? 'coleta' : 'coletas'} fora do período,
                em andamento ou sem conclusão confirmada.
              </small>
            )}
            {eligible.length > limit && (
              <small>Selecione até {limit} coletas por atualização.</small>
            )}
          </fieldset>
          <details className="report-filters">
            <summary>
              Filtros avançados · {terms.length} de {availableTerms.length} palavras-chave
            </summary>
            <p>
              Selecione termos já coletados. Novos termos precisam de uma coleta no SERP Monitor.
            </p>
            <fieldset>
              <legend>Palavras-chave incluídas</legend>
              <div className="report-term-list">
                {availableTerms.map((term) => (
                  <label key={term}>
                    <input
                      type="checkbox"
                      checked={terms.includes(term)}
                      disabled={!terms.includes(term) && terms.length >= limit}
                      onChange={(e) =>
                        setTermSelection(
                          e.target.checked ? [...terms, term] : terms.filter((k) => k !== term),
                        )
                      }
                    />
                    {term}
                  </label>
                ))}
              </div>
              {!availableTerms.length && <p>Selecione uma coleta para ver seus termos.</p>}
              {availableTerms.length > 0 && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => setTermSelection(null)}
                >
                  Incluir todos os termos{availableTerms.length > limit ? ` (até ${limit})` : ''}
                </button>
              )}
            </fieldset>
          </details>
          {selected.length > 0 && !terms.length && (
            <p role="alert">Selecione ao menos uma palavra-chave nos filtros avançados.</p>
          )}
          <p className="briefing-muted">
            Combina as evidências das coletas selecionadas sem duplicar anunciantes.
          </p>
        </>
      )}
      <ReportBaseline baseline={reportBaseline(report, days)} />
      {error && (
        <p role="alert" className="briefing-note">
          {error}
        </p>
      )}
      <div className="report-form-actions">
        {review && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setReview(false)}
          >
            Voltar aos filtros
          </button>
        )}
        <button className="primary" disabled={blocked}>
          {busy
            ? 'Conferindo dados…'
            : review
              ? 'Salvar proposta para aprovação'
              : 'Revisar aprovação individual'}
        </button>
      </div>
      {!data.enabled.reports && <p>Execução indisponível nesta conta.</p>}
    </form>
  );
}
