import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Users,
  History,
  Radar,
  MessagesSquare,
  CalendarCheck,
  ArrowUpRight,
  FileSearch,
  Copy,
  ListChecks,
  RefreshCw,
  X,
  ChevronRight,
  FileText,
  CircleAlert,
  Check,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import {
  briefingBoards,
  organizeBriefing,
  reviewItems,
  draftForReview,
  helpdeskDraftUrl,
  HUB_HELPDESK,
  answerText,
  claimLabels,
} from '../services/briefing';
import { AnswerPanel } from './AnswerPanel';

const icons = {
  company: Building2,
  people: Users,
  history: History,
  opportunity: Radar,
  approach: MessagesSquare,
  meeting: CalendarCheck,
};
const date = (value) =>
  value
    ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'Data não registrada';

function DetailSheet({ title, subtitle, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="briefing-sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header className="sheet-heading">
        <div>
          <span className="eyebrow">BRIEFING 360</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="sheet-close" onClick={onClose} aria-label="Fechar painel" autoFocus>
          <X size={20} />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}

function Claim({ claim, compact = false }) {
  return (
    <article className={`briefing-claim ${compact ? 'compact' : ''}`}>
      {(claim.origin === 'note' || claim.kind !== 'fact') && (
        <span className={`claim-kind ${claim.kind}`}>
          {claim.origin === 'note' ? 'Registro interno' : claimLabels[claim.kind]}
        </span>
      )}
      <p>{claim.text}</p>
    </article>
  );
}

function Materials({ snapshotId, onSource, onCopy, record, onGenerate, busy }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    apiRequest('materials', { snapshotId })
      .then((result) => {
        if (active) {
          setData(result);
          setError('');
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [snapshotId, retry]);
  return (
    <section className="briefing-section">
      <div className="briefing-section-heading">
        <div>
          <h2>Relatórios e materiais</h2>
          <p>
            Links registrados nos campos do negócio. A existência do link não confirma conteúdo,
            revisão ou envio.
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="briefing-note">
          {error}{' '}
          <button className="secondary" onClick={() => setRetry((value) => value + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {!data && !error && (
        <p role="status" className="briefing-note">
          Carregando os links preservados…
        </p>
      )}
      {data && !data.materials.length && (
        <p className="briefing-note">
          Não foram encontrados links de relatório ou apresentação nos campos desta versão. Consulte
          as notas em Dados e fontes.
        </p>
      )}
      <div className="material-grid">
        {data?.materials.map((material) => (
          <article className="material-card" key={material.url}>
            <FileText size={21} />
            <h3>{material.title}</h3>
            <span className="status-pill">Link registrado · a verificar</span>
            <p>{new URL(material.url).hostname}</p>
            <div className="material-actions">
              <a
                className="secondary"
                href={material.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir material <ArrowUpRight size={14} />
              </a>
              <button
                className="text-action"
                onClick={() => onSource(material.sourceId, material.quote)}
              >
                Ver origem
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="briefing-action-strip">
        <div>
          <strong>Prepare o roteiro com as evidências disponíveis</strong>
          <p>
            O roteiro pode ser copiado com fontes. Gerar um roteiro não cria nem revisa uma
            apresentação.
          </p>
        </div>
        <div className="briefing-actions">
          <button
            className="secondary"
            disabled={!record}
            onClick={() => onCopy(answerText(record))}
          >
            <Copy size={14} /> Copiar roteiro salvo
          </button>
          <button className="primary" disabled={busy} onClick={() => onGenerate('briefing')}>
            Gerar roteiro de reunião
          </button>
        </div>
      </div>
    </section>
  );
}

export function BriefingDashboard({
  snapshot,
  records,
  record,
  mode,
  onMode,
  onSelect,
  onGenerate,
  onSource,
  onCopy,
  onAsk,
  configuration,
  busy,
  sessionState,
  onSessionState,
}) {
  const [view, setView] = useState('briefing'),
    [sheet, setSheet] = useState(null),
    [company, setCompany] = useState(null),
    [companyError, setCompanyError] = useState(''),
    [companyRetry, setCompanyRetry] = useState(0);
  useEffect(() => {
    let active = true;
    apiRequest('company', { snapshotId: snapshot.id })
      .then((result) => {
        if (active) {
          setCompany(result);
          setCompanyError('');
        }
      })
      .catch((error) => {
        if (active) setCompanyError(error.message);
      });
    return () => {
      active = false;
    };
  }, [snapshot.id, companyRetry]);
  const { checks = {}, reviews = {}, drafts = {} } = sessionState || {};
  const setChecks = (update) =>
    onSessionState((previous) => ({ ...previous, checks: update(previous.checks || {}) }));
  const setReviews = (update) =>
    onSessionState((previous) => ({ ...previous, reviews: update(previous.reviews || {}) }));
  const setDrafts = (update) =>
    onSessionState((previous) => ({ ...previous, drafts: update(previous.drafts || {}) }));
  const boards = organizeBriefing(record, company);
  const items = reviewItems(record);
  const claims = boards.flatMap((board) => board.claims);
  const pending = items.filter((item) => !reviews[item.id]);
  const suggestions = record?.answer?.suggestedQuestions || [];
  const gaps = record?.answer?.gaps || [];
  const selectedBoard = sheet?.type === 'board' && boards.find((board) => board.id === sheet.id);
  const selectedIssue = sheet?.type === 'issue' && items.find((item) => item.id === sheet.id);
  const draft =
    selectedIssue && (drafts[selectedIssue.id] || draftForReview(selectedIssue, snapshot));
  const hubUrl = draft && helpdeskDraftUrl(draft);
  const modes = records.filter((answer) => answer.mode === mode);
  const source = (id, quote) => {
    setSheet(null);
    onSource(id, quote);
  };
  const ask = (question) => {
    setSheet(null);
    onAsk(question);
  };
  const summary = record?.answer?.sections.find((section) => /resumo|momento/i.test(section.title))
    ?.claims[0];
  const next = claims.find(
    (claim) =>
      claim.kind === 'recommendation' &&
      ['approach', 'meeting'].includes(boards.find((board) => board.claims.includes(claim))?.id),
  );
  const openIssue = (item) => setSheet({ type: 'issue', id: item.id });
  return (
    <div className="briefing-workspace">
      <header className="briefing-toolbar">
        <div>
          <span className="eyebrow">CONTEXTO PARA A PRÓXIMA CONVERSA</span>
          <h2>Briefing 360</h2>
        </div>
        <div className="briefing-mode" role="group" aria-label="Objetivo do briefing">
          <button aria-pressed={mode === 'prospecting'} onClick={() => onMode('prospecting')}>
            Pré-prospecção
          </button>
          <button aria-pressed={mode === 'briefing'} onClick={() => onMode('briefing')}>
            Pré-reunião
          </button>
        </div>
        <button className="secondary" onClick={() => setSheet({ type: 'checklist' })}>
          <ListChecks size={16} /> Revisar preparação
        </button>
      </header>
      <nav className="briefing-subnav" aria-label="Áreas do briefing">
        {[
          ['briefing', 'Quadros resumo'],
          ['materials', 'Relatórios e materiais'],
          ['reviews', 'Pendências e erros'],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={view === id ? 'page' : undefined}
            className={view === id ? 'active' : ''}
            onClick={() => setView(id)}
          >
            {label}
            {id === 'reviews' && pending.length > 0 && (
              <span className="nav-count">{pending.length}</span>
            )}
          </button>
        ))}
      </nav>
      {view === 'briefing' && (
        <>
          {(summary || next) && (
            <section className="briefing-summary">
              <div>
                <span className="summary-label">
                  {mode === 'briefing' ? 'PREPARAÇÃO DA REUNIÃO' : 'PREPARAÇÃO DA ABORDAGEM'}
                </span>
                <h3>{summary ? 'Momento do negócio' : 'O contexto em seis quadros'}</h3>
                <p>{summary?.text || 'Empresa, histórico e próximos passos para a conversa.'}</p>
              </div>
              <div className="summary-next">
                <span className="summary-label">PRÓXIMO PASSO RECOMENDADO</span>
                <p>
                  {next?.text ||
                    'Consulte as lacunas e valide os pontos necessários antes do próximo contato.'}
                </p>
                {next && (
                  <button
                    className="text-action"
                    onClick={() =>
                      setSheet({
                        type: 'board',
                        id: boards.find((board) => board.claims.includes(next)).id,
                      })
                    }
                  >
                    Ver orientação completa <ChevronRight size={14} />
                  </button>
                )}
              </div>
            </section>
          )}
          <div className="briefing-generation">
            <div>
              <p>
                {record
                  ? `Atualizado em ${date(record.created_at)}`
                  : 'Os quadros serão preenchidos com conclusões apoiadas nas fontes.'}
              </p>
              {record && record.mode !== mode && (
                <p className="attention-text">
                  Exibindo a análise{' '}
                  {record.mode === 'overview' ? 'geral' : 'salva de outro objetivo'}. Gere uma
                  versão específica para {mode === 'briefing' ? 'a reunião' : 'a prospecção'} quando
                  precisar.
                </p>
              )}
            </div>
            <div className="briefing-actions">
              <button
                className="text-action"
                disabled={!record && !company?.facts.length}
                onClick={() => onCopy(answerText(record, company))}
              >
                <Copy size={14} /> Copiar com fontes
              </button>
              <button
                className="primary"
                disabled={busy || !configuration.analysisConfigured}
                onClick={() => onGenerate(mode)}
              >
                <RefreshCw size={14} />
                {mode === 'briefing' ? 'Gerar briefing' : 'Gerar prospecção'}
              </button>
            </div>
          </div>
          <div className="briefing-grid">
            {boards.map((board, index) => {
              const Icon = icons[board.id];
              const priority =
                mode === 'briefing'
                  ? ['people', 'meeting'].includes(board.id)
                  : ['company', 'approach'].includes(board.id);
              return (
                <section
                  className={`briefing-board ${priority ? 'priority' : ''}`}
                  key={board.id}
                  aria-label={board.title}
                >
                  <header>
                    <span className="board-icon">
                      <Icon size={18} />
                    </span>
                    <div>
                      <h3>{board.title}</h3>
                      <p>{board.subtitle}</p>
                    </div>
                    <span className="board-number">0{index + 1}</span>
                  </header>
                  <div className="board-preview">
                    {board.id === 'company' && !company && (
                      <p className="briefing-muted" role={companyError ? 'alert' : 'status'}>
                        {companyError ? (
                          <>
                            Não foi possível ler os dados da empresa.{' '}
                            <button
                              className="text-action"
                              onClick={() => setCompanyRetry((value) => value + 1)}
                            >
                              Tentar novamente
                            </button>
                          </>
                        ) : (
                          'Lendo dados registrados da empresa…'
                        )}
                      </p>
                    )}
                    {board.claims.length
                      ? board.claims
                          .slice(0, 2)
                          .map((claim) => <Claim key={claim.key} claim={claim} compact />)
                      : (board.id !== 'company' || company) && (
                          <div className="board-empty">
                            <FileSearch size={22} />
                            <strong>
                              {board.id === 'company'
                                ? 'Sem dados identificados nesta versão'
                                : 'Sem conclusão nesta análise'}
                            </strong>
                            <p>Isso não significa que a informação não exista no CRM.</p>
                            <button className="text-action" onClick={() => ask(board.questions[0])}>
                              Investigar este assunto <ChevronRight size={14} />
                            </button>
                          </div>
                        )}
                  </div>
                  <footer>
                    <span>
                      {board.claims.length}{' '}
                      {board.id === 'company'
                        ? 'itens'
                        : board.claims.length === 1
                          ? 'conclusão'
                          : 'conclusões'}
                    </span>
                    <button
                      className="text-action"
                      onClick={() => setSheet({ type: 'board', id: board.id })}
                    >
                      Ver quadro completo <ChevronRight size={14} />
                    </button>
                  </footer>
                </section>
              );
            })}
          </div>
          <div className="briefing-bottom-grid">
            <section className="briefing-section">
              <div className="briefing-section-heading">
                <h3>Pontos para esclarecer</h3>
                <span className="status-pill">{suggestions.length}</span>
              </div>
              {suggestions.length ? (
                suggestions.slice(0, 3).map((question, i) => (
                  <button className="question-row" key={i} onClick={() => ask(question)}>
                    {question}
                    <ArrowUpRight size={15} />
                  </button>
                ))
              ) : (
                <p className="briefing-muted">
                  Confira os requisitos de cada quadro em Revisar preparação.
                </p>
              )}
              {suggestions.length > 3 && (
                <button className="text-action" onClick={() => setSheet({ type: 'questions' })}>
                  Ver todas as perguntas
                </button>
              )}
            </section>
            <section className="briefing-section">
              <div className="briefing-section-heading">
                <h3>Qualidade e cobertura</h3>
                <CircleAlert size={17} />
              </div>
              <p className="briefing-muted">
                {pending.length
                  ? `${pending.length} ocorrência(s) sinalizada(s) para revisão individual.`
                  : 'Confira as lacunas antes de considerar o briefing completo.'}
              </p>
              <p className="briefing-muted">{gaps.length} pontos com informação incompleta.</p>
              <button className="secondary" onClick={() => setView('reviews')}>
                Revisar pendências <ChevronRight size={14} />
              </button>
            </section>
          </div>
          <details className="briefing-full">
            <summary>Ler análise completa e versões anteriores</summary>
            {modes.length > 1 && (
              <label>
                Versão da análise
                <select
                  className="input"
                  value={record?.mode === mode ? record.id : ''}
                  onChange={(event) =>
                    onSelect(records.find((item) => item.id === event.target.value))
                  }
                >
                  {modes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {date(item.created_at)} · {item.model}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <AnswerPanel record={record} onSource={source} onCopy={onCopy} />
          </details>
        </>
      )}
      {view === 'materials' && (
        <Materials
          snapshotId={snapshot.id}
          onSource={source}
          onCopy={onCopy}
          record={record}
          onGenerate={onGenerate}
          busy={busy || !configuration.analysisConfigured}
        />
      )}
      {view === 'reviews' && (
        <section className="briefing-section">
          <div className="briefing-section-heading">
            <div>
              <h2>Pendências e erros</h2>
              <p>
                Sinais encontrados na análise. Confirme a evidência antes de atribuir uma falha ao
                preenchimento ou à automação.
              </p>
            </div>
            <span className="status-pill">{pending.length} a validar</span>
          </div>
          <p className="briefing-note">
            Revise cada ocorrência individualmente. O relato e as evidências seguem preenchidos para
            o Helpdesk do Hub RevOps, onde você confere a triagem e confirma a abertura. As
            marcações locais abaixo valem para esta sessão.
          </p>
          <div className="review-list">
            {items.map((item) => (
              <article key={item.id}>
                <span className={`status-pill ${reviews[item.id] ? '' : 'warning'}`}>
                  {reviews[item.id] || 'A validar'}
                </span>
                <h3>{item.title}</h3>
                <p>{item.found}</p>
                <div className="briefing-actions">
                  <button className="secondary" onClick={() => openIssue(item)}>
                    Revisar ocorrência <ChevronRight size={14} />
                  </button>
                  {reviews[item.id] && (
                    <button
                      className="text-action"
                      onClick={() => setReviews((previous) => ({ ...previous, [item.id]: null }))}
                    >
                      Reabrir revisão
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!items.length && (
            <p className="briefing-note">
              Nenhuma divergência foi sinalizada no texto desta análise. Isso não certifica que os
              dados e o fluxo estejam livres de erros.
            </p>
          )}
          <details className="coverage-details" open>
            <summary>Lacunas e limites da resposta ({gaps.length})</summary>
            <ul>
              {gaps.map((gap, i) => (
                <li key={i}>{gap}</li>
              ))}
            </ul>
            {!gaps.length && <p>Consulte as fontes e os limites da coleta.</p>}
          </details>
        </section>
      )}
      {selectedBoard && (
        <DetailSheet
          title={selectedBoard.title}
          subtitle={selectedBoard.subtitle}
          onClose={() => setSheet(null)}
        >
          {selectedBoard.id === 'company' && company && (
            <div className="briefing-note">
              <strong>
                {company.organizationId
                  ? `Organização #${company.organizationId}`
                  : 'Organização não identificada'}
              </strong>
              {!!company.warnings.length && (
                <details className="coverage-details">
                  <summary>Pontos a conferir ({company.warnings.length})</summary>
                  {company.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </details>
              )}
            </div>
          )}
          <div className="sheet-claims">
            {selectedBoard.claims.map((claim) => (
              <Claim key={claim.key} claim={claim} />
            ))}
            {!selectedBoard.claims.length && (
              <p className="briefing-note">
                Ainda não há conclusões sobre este assunto nesta análise.
              </p>
            )}
          </div>
          <details className="sheet-checks">
            <summary>O que conferir neste quadro</summary>
            {selectedBoard.questions.map((question, i) => (
              <button className="question-row" key={i} onClick={() => ask(question)}>
                {question}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </details>
        </DetailSheet>
      )}
      {sheet?.type === 'checklist' && (
        <DetailSheet
          title="Revisar preparação"
          subtitle={`${Object.values(checks).filter(Boolean).length} de ${briefingBoards.reduce((sum, board) => sum + board.questions.length, 0)} pontos marcados nesta sessão`}
          onClose={() => setSheet(null)}
        >
          <p className="briefing-note">
            Marque somente após conferir as fontes. Esta revisão manual não altera o CRM nem
            comprova a execução de atividades.
          </p>
          {briefingBoards.map((board) => (
            <section className="sheet-checks" key={board.id}>
              <h3>{board.title}</h3>
              {board.questions.map((question, i) => (
                <label className="preparation-check" key={i}>
                  <input
                    type="checkbox"
                    checked={Boolean(checks[`${board.id}:${i}`])}
                    onChange={(event) =>
                      setChecks((previous) => ({
                        ...previous,
                        [`${board.id}:${i}`]: event.target.checked,
                      }))
                    }
                  />
                  <span>{question}</span>
                </label>
              ))}
              <button
                className="text-action"
                onClick={() => setSheet({ type: 'board', id: board.id })}
              >
                Consultar quadro <ChevronRight size={14} />
              </button>
            </section>
          ))}
        </DetailSheet>
      )}
      {sheet?.type === 'questions' && (
        <DetailSheet title="Perguntas para esclarecer" onClose={() => setSheet(null)}>
          {suggestions.map((question, i) => (
            <button className="question-row" key={i} onClick={() => ask(question)}>
              {question}
              <ArrowUpRight size={15} />
            </button>
          ))}
        </DetailSheet>
      )}
      {selectedIssue && (
        <DetailSheet
          title="Revisar ocorrência"
          subtitle="Uma decisão por ocorrência"
          onClose={() => setSheet(null)}
        >
          <span className="status-pill warning">A validar nas fontes</span>
          <dl className="issue-facts">
            <dt>Encontrado</dt>
            <dd>{selectedIssue.found}</dd>
            <dt>Esperado</dt>
            <dd>{selectedIssue.expected}</dd>
            <dt>Impacto a avaliar</dt>
            <dd>{selectedIssue.impact}</dd>
          </dl>
          <div className="claim-evidence">
            {selectedIssue.citations.map((ref, i) => (
              <button key={i} onClick={() => source(ref.sourceId, ref.quote)}>
                <span>
                  <FileSearch size={14} /> Conferir evidência
                </span>
                <q>{ref.quote}</q>
              </button>
            ))}
          </div>
          <div className="briefing-actions review-decisions">
            <button
              className="secondary"
              onClick={() => {
                setReviews((previous) => ({ ...previous, [selectedIssue.id]: 'Não é erro' }));
                setSheet(null);
              }}
            >
              Não é erro
            </button>
            <button
              className="secondary"
              onClick={() => {
                setReviews((previous) => ({
                  ...previous,
                  [selectedIssue.id]: 'Correção informada nesta sessão',
                }));
                setSheet(null);
              }}
            >
              <Check size={14} /> Já corrigido
            </button>
          </div>
          <section className="sheet-checks">
            <h3>Rascunho para o Helpdesk do Hub RevOps</h3>
            <p className="briefing-muted">
              Confira os dados antes de continuar. O chamado só existe após a confirmação no Hub.
              Consulte seus chamados antes de abrir outro para a mesma ocorrência.
            </p>
            <a
              className="text-action"
              href={`${HUB_HELPDESK}/meus`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Consultar meus chamados <ArrowUpRight size={14} />
            </a>
            <label className="draft-field">
              Título
              <input
                className="input"
                value={draft.title}
                onChange={(event) =>
                  setDrafts((previous) => ({
                    ...previous,
                    [selectedIssue.id]: { ...draft, title: event.target.value },
                  }))
                }
              />
            </label>
            <label className="draft-field">
              Descrição
              <textarea
                className="input"
                rows={12}
                value={draft.description}
                onChange={(event) =>
                  setDrafts((previous) => ({
                    ...previous,
                    [selectedIssue.id]: { ...draft, description: event.target.value },
                  }))
                }
              />
            </label>
            <p className="briefing-muted">
              {`${draft.title.trim()}\n\n${draft.description.trim()}`.length}/4.000 caracteres.{' '}
              {hubUrl
                ? 'Envio de uma ocorrência por vez.'
                : 'Ajuste o texto para continuar no formulário do Hub.'}
            </p>
            <div className="briefing-actions">
              {hubUrl && (
                <a className="primary" href={hubUrl} target="_blank" rel="noopener noreferrer">
                  Revisar e continuar no Hub <ArrowUpRight size={15} />
                </a>
              )}
              <button
                className="secondary"
                onClick={() => onCopy(`${draft.title}\n\n${draft.description}`)}
              >
                <Copy size={15} /> Copiar este rascunho
              </button>
            </div>
          </section>
        </DetailSheet>
      )}
    </div>
  );
}
