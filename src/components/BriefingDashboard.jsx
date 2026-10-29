import { useEffect, useState } from 'react';
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
  ChevronRight,
  CircleAlert,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { organizeBriefing, answerText, claimLabels } from '../services/briefing';
import { AnswerPanel } from './AnswerPanel';
import { DetailSheet } from './DetailSheet';
import { SpreadsheetFiles } from './SpreadsheetFiles';
import { PreparationWorkflow } from './PreparationWorkflow';

const icons = {
  company: Building2,
  blockers: CircleAlert,
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

export function BriefingDashboard({
  snapshot,
  records,
  record,
  onSelect,
  onGenerate,
  onSource,
  onCopy,
  onAsk,
  configuration,
  busy,
}) {
  const [pendingCount, setPendingCount] = useState(0);
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
  const boards = organizeBriefing(record, company);
  const claims = boards.flatMap((board) => board.claims);
  const suggestions = record?.answer?.suggestedQuestions || [];
  const gaps = record?.answer?.gaps || [];
  const selectedBoard = sheet?.type === 'board' && boards.find((board) => board.id === sheet.id);
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
  return (
    <div className="briefing-workspace">
      <header className="briefing-toolbar">
        <div>
          <span className="eyebrow">CONTEXTO PARA A PRÓXIMA CONVERSA</span>
          <h2>Briefing comercial</h2>
        </div>
        <button className="secondary" onClick={() => setView('reviews')}>
          <ListChecks size={16} /> Pendências salvas
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
            {id === 'reviews' && pendingCount > 0 && (
              <span className="nav-count">{pendingCount}</span>
            )}
          </button>
        ))}
      </nav>
      <PreparationWorkflow
        snapshot={snapshot}
        record={record}
        view={view}
        onNavigate={setView}
        onPendingCount={setPendingCount}
        onSource={source}
      />
      {view === 'materials' && <SpreadsheetFiles snapshotId={snapshot.id} record={record} />}
      {view === 'briefing' && (
        <>
          {summary && (
            <section className="briefing-summary">
              <div>
                <span className="summary-label">RESUMO COMERCIAL</span>
                <h3>{summary ? 'Momento do negócio' : 'Preparação da conversa'}</h3>
                <p>{summary?.text || 'Histórico, pessoas e próximos passos para a conversa.'}</p>
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
                onClick={onGenerate}
              >
                <RefreshCw size={14} />
                {record ? 'Atualizar briefing' : 'Gerar briefing'}
              </button>
            </div>
          </div>
          <div className="briefing-grid">
            {boards
              .filter((board) => board.id !== 'company')
              .map((board, index) => {
                const Icon = icons[board.id];
                return (
                  <section className="briefing-board" key={board.id} aria-label={board.title}>
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
                            .slice(0, 4)
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
                              <button
                                className="text-action"
                                onClick={() => ask(board.questions[0])}
                              >
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
          <button
            className="text-action"
            onClick={() => setSheet({ type: 'board', id: 'company' })}
          >
            <Building2 size={15} /> Contexto da empresa e do grupo
          </button>
          {companyError && (
            <p className="briefing-muted">
              Dados da empresa indisponíveis.{' '}
              <button className="text-action" onClick={() => setCompanyRetry((value) => value + 1)}>
                Tentar novamente
              </button>
            </p>
          )}
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
                  Use as perguntas abaixo para aprofundar o briefing.
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
                {pendingCount
                  ? `${pendingCount} ocorrência(s) sinalizada(s) para revisão individual.`
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
            {records.length > 1 && (
              <label>
                Versão da análise
                <select
                  aria-label="Versão da análise"
                  className="input"
                  value={record?.id || ''}
                  onChange={(event) =>
                    onSelect(records.find((item) => item.id === event.target.value))
                  }
                >
                  {records.map((item) => (
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
    </div>
  );
}
