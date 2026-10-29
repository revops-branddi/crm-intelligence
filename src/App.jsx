import { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Search,
  RefreshCw,
  Loader2,
  LogOut,
  LayoutDashboard,
  FolderOpen,
  PlugZap,
  ArrowUpRight,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './hooks/useAuth';
import { apiRequest } from './services/api';
import { briefingVersions } from './services/briefing';
import { LoginScreen } from './components/ui/LoginScreen';
import { AnswerPanel } from './components/AnswerPanel';
import { EvidencePanel } from './components/EvidencePanel';
import { BriefingDashboard } from './components/BriefingDashboard';
import {
  Brand,
  WorkflowIntro,
  ConnectionPanel,
  CollectionGaps,
  SourceDialog,
} from './components/WorkspaceUI';
const date = (value) =>
  value
    ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'Ainda não concluída';
const statusLabel = {
  collecting: 'Em coleta',
  complete: 'Coleta concluída',
  partial: 'Coleta com lacunas',
  cancelled: 'Cancelada',
};
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Paused', 'AbortError'));
    const stop = () => {
      clearTimeout(timer);
      reject(new DOMException('Paused', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal.addEventListener('abort', stop, { once: true });
  });
}

function Workspace({ user, logout }) {
  const [configuration, setConfiguration] = useState(null),
    [token, setToken] = useState(''),
    [dealId, setDealId] = useState('');
  const [snapshot, setSnapshot] = useState(null),
    [saved, setSaved] = useState([]),
    [listOffset, setListOffset] = useState(0),
    [hasMore, setHasMore] = useState(false);
  const [answers, setAnswers] = useState([]),
    [selectedAnswer, setSelectedAnswer] = useState(null),
    [selectedBriefing, setSelectedBriefing] = useState(null),
    [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [sourceData, setSourceData] = useState(null),
    [openedSource, setOpenedSource] = useState(null);
  const [page, setPage] = useState('home'),
    [savedQuery, setSavedQuery] = useState('');
  const controller = useRef(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    apiRequest('status')
      .then((result) => {
        if (active) setConfiguration(result);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  async function configure(event) {
    event.preventDefault();
    setBusy('connection');
    setError('');
    try {
      await apiRequest('connect', { token });
      setToken('');
      setConfiguration(await apiRequest('status'));
      setNotice('Pipedrive conectado. Credencial armazenada somente no servidor.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy('');
    }
  }
  async function disconnect() {
    setBusy('connection');
    setError('');
    try {
      await apiRequest('disconnect');
      setConfiguration(await apiRequest('status'));
      setSnapshot(null);
      setAnswers([]);
      setSaved([]);
      setSourceData(null);
      setOpenedSource(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy('');
    }
  }
  async function list(offset = 0) {
    setPage('saved');
    setBusy('list');
    setError('');
    try {
      const result = await apiRequest('list', { offset });
      setSaved(result.snapshots);
      setHasMore(result.hasMore);
      setListOffset(offset);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy('');
    }
  }
  async function load(id) {
    setBusy('load');
    setError('');
    try {
      const result = await apiRequest('get', { snapshotId: id });
      const history = await apiRequest('answers', { snapshotId: id });
      setPage('home');
      setSnapshot(result.snapshot);
      setAnswers(history.answers);
      setSelectedAnswer(null);
      setSourceData(null);
      setOpenedSource(null);
      setSelectedBriefing(null);
      setDealId(result.snapshot.deal_id);
      setNotice('Versão histórica carregada. Use “Nova extração” para atualizar os dados.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy('');
    }
  }
  async function openDeal(event) {
    event.preventDefault();
    setBusy('load');
    setError('');
    try {
      const result = await apiRequest('latest', { dealId: dealId.trim() });
      if (!result.snapshot) {
        await collect();
        return;
      }
      setSnapshot(result.snapshot);
      setAnswers(result.answers);
      setSelectedAnswer(null);
      setSourceData(null);
      setOpenedSource(null);
      setSelectedBriefing(null);
      setPage('home');
      setNotice(
        `Versão salva de ${date(result.snapshot.started_at)} carregada. Use “Nova extração” para atualizar os dados.`,
      );
      if (!result.answers.length && configuration.analysisConfigured)
        await analyze('overview', result.snapshot);
    } catch (error) {
      setError(error.message);
    } finally {
      if (mounted.current) setBusy('');
    }
  }
  async function collect(existing, freshDealId = dealId) {
    setPage('home');
    setError('');
    setNotice('');
    setBusy('extracting');
    const extractionController = new AbortController();
    controller.current = extractionController;
    const signal = extractionController.signal;
    try {
      let current =
        existing || (await apiRequest('start', { dealId: freshDealId.trim() }, signal)).snapshot;
      setSnapshot(current);
      if (!existing) {
        setAnswers([]);
        setSelectedAnswer(null);
      }
      setSourceData(null);
      setOpenedSource(null);
      setSelectedBriefing(null);
      let retries = 0,
        analyzed = Boolean(existing && answers.some((answer) => answer.mode === 'overview')),
        analysisSucceeded = analyzed;
      while (current.status === 'collecting') {
        try {
          current = (await apiRequest('step', { snapshotId: current.id }, signal)).snapshot;
          if (!mounted.current) return;
          setSnapshot(current);
          if (current.analysisReady && !analyzed && configuration.analysisConfigured) {
            analyzed = true;
            analysisSucceeded = await analyze('overview', current);
            controller.current = extractionController;
            if (signal.aborted) throw new DOMException('Paused', 'AbortError');
            setBusy('extracting');
          }
          retries = 0;
        } catch (error) {
          if (error.name === 'AbortError') throw error;
          if ([409, 429, 502, 503, 504].includes(error.status) && retries++ < 3) {
            await delay(Math.min(60, error.retryAfter || 2 ** retries) * 1000, signal);
            continue;
          }
          throw error;
        }
      }
      if (!analyzed && configuration.analysisConfigured && mounted.current)
        await analyze('overview', current);
      else if (analysisSucceeded)
        setNotice('Coleta finalizada. A análise está disponível e os originais foram preservados.');
    } catch (error) {
      if (mounted.current) {
        if (error.name === 'AbortError')
          setNotice('Coleta pausada. Os registros já salvos serão reutilizados ao retomar.');
        else setError(error.message);
      }
    } finally {
      if (mounted.current) setBusy('');
    }
  }
  async function analyze(mode, target = snapshot) {
    setBusy('analysis');
    setError('');
    controller.current = new AbortController();
    try {
      // Read legacy XLSX in resumable requests before spending an LLM call.
      // This also keeps attachment work outside the generation time limit.
      for (let batch = 0; ; batch++) {
        const files = await apiRequest(
          'readSpreadsheets',
          { snapshotId: target.id },
          controller.current.signal,
        );
        if (!files.remaining) break;
        if (!files.processed || batch >= 9)
          throw new Error(
            'Ainda há planilhas aguardando leitura. Tente atualizar novamente para continuar de onde parou.',
          );
      }
      const result = await apiRequest(
        'answer',
        { snapshotId: target.id, mode, question: mode === 'question' ? question : '' },
        controller.current.signal,
      );
      if (mounted.current) {
        setAnswers((previous) => [result.answer, ...previous]);
        if (mode === 'question') setSelectedAnswer(result.answer);
        else setSelectedBriefing(result.answer);
        setNotice(mode === 'question' ? 'Resposta pronta.' : 'Briefing atualizado.');
        return true;
      }
    } catch (error) {
      if (mounted.current)
        setError(
          error.name === 'AbortError'
            ? 'Solicitação interrompida. Consulte as respostas salvas antes de gerar novamente.'
            : error.message,
        );
    } finally {
      if (mounted.current) setBusy('');
    }
  }
  async function viewSources() {
    const resumeBusy = busy === 'extracting' ? 'extracting' : '';
    setBusy('sources');
    setError('');
    try {
      setSourceData(await apiRequest('sources', { snapshotId: snapshot.id }));
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(resumeBusy);
    }
  }
  async function openSource(id, quote) {
    setError('');
    try {
      const result = await apiRequest('source', { snapshotId: snapshot.id, sourceId: id });
      setOpenedSource({ ...result.source, selectedQuote: quote });
    } catch (error) {
      setError(error.message);
    }
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copiado com fontes.');
    } catch {
      setError('Não foi possível copiar. Selecione o texto manualmente.');
    }
  }
  const ready =
    snapshot && (snapshot.analysisReady || ['complete', 'partial'].includes(snapshot.status));
  const versions = briefingVersions(answers);
  const currentBriefing =
    versions.find((record) => record.id === selectedBriefing?.id) || versions[0];
  const currentAnswer =
    selectedAnswer?.mode === 'question'
      ? selectedAnswer
      : answers.find((answer) => answer.mode === 'question');
  return (
    <div className={`app-shell ${snapshot && page === 'home' ? 'has-deal' : ''}`}>
      <aside className="app-sidebar">
        <Brand />
        <div className="workspace-label">WORKSPACE COMERCIAL</div>
        <nav className="main-nav" aria-label="Navegação principal">
          {[
            ['home', 'Visão do negócio', LayoutDashboard],
            ['saved', 'Extrações salvas', FolderOpen],
            ['connection', 'Integração', PlugZap],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              aria-current={page === id ? 'page' : undefined}
              disabled={!!busy}
              onClick={() => (id === 'saved' && configuration?.connection ? list() : setPage(id))}
            >
              <Icon size={19} />
              {label}
              {page === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={22} />
          <strong>Inteligência com evidência.</strong>
          <p>Da informação original à sua próxima conversa.</p>
        </div>
        <div className="sidebar-account">
          <span className="avatar">{user.email.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>Conta corporativa</strong>
            <span>{user.email}</span>
          </div>
          <button
            title="Sair"
            aria-label="Sair"
            onClick={() => {
              controller.current?.abort();
              void logout();
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="app-content">
        <header className="workspace-header">
          <div>
            Workspace <ChevronRight size={14} />
            <strong>
              {page === 'saved'
                ? 'Extrações salvas'
                : page === 'connection'
                  ? 'Integração'
                  : 'Inteligência comercial'}
            </strong>
          </div>
          <span className={`connection-status ${configuration?.connection ? 'connected' : ''}`}>
            <i />
            {configuration?.connection ? 'Pipedrive conectado' : 'Conectar Pipedrive'}
          </span>
        </header>
        <main className="workspace-main">
          <div className="page-heading">
            <div>
              <span className="eyebrow">INTELIGÊNCIA COMERCIAL</span>
              <h1>
                {page === 'saved'
                  ? 'Seu histórico, organizado.'
                  : page === 'connection'
                    ? 'Suas conexões.'
                    : snapshot
                      ? 'Seu briefing comercial.'
                      : 'Boas conversas começam aqui.'}
              </h1>
              <p>
                {page === 'saved'
                  ? 'Retome uma análise e consulte os dados preservados de cada versão.'
                  : 'Transforme os dados do CRM em clareza para a próxima abordagem.'}
              </p>
            </div>
            <span className="workspace-tag">BRANDDI / REVOPS</span>
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex justify-between gap-3"
            >
              {error}
              <button onClick={() => setError('')} aria-label="Fechar erro">
                ×
              </button>
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-branddi-navy flex justify-between gap-3"
            >
              {notice}
              <button onClick={() => setNotice('')} aria-label="Fechar aviso">
                ×
              </button>
            </div>
          )}
          {!configuration && !error && <p>Verificando conexão…</p>}
          {configuration && !configuration.connection && (
            <>
              <ConnectionPanel
                token={token}
                setToken={setToken}
                busy={busy}
                configure={configure}
              />
              <WorkflowIntro />
            </>
          )}
          {configuration?.connection && (
            <>
              {page === 'connection' && (
                <section className="card integration-connected">
                  <PlugZap size={30} />
                  <div>
                    <span className="eyebrow">CONEXÃO ATIVA</span>
                    <h2>Pipedrive conectado</h2>
                    <p>
                      Conta {configuration.connection.company_id}. Suas extrações estão vinculadas a
                      esta conexão.
                    </p>
                  </div>
                  <button className="secondary" disabled={!!busy} onClick={disconnect}>
                    Desconectar
                  </button>
                </section>
              )}
              {page === 'home' && (
                <details className="card launch-card" open={!snapshot || undefined}>
                  <summary>Abrir outro negócio</summary>
                  <div className="launch-content">
                    <div className="flex justify-between gap-3 items-center mb-4">
                      <p className="text-xs text-emerald-700 font-semibold">
                        Pipedrive conectado · conta {configuration.connection.company_id}
                      </p>
                      <span className="eyebrow">NOVA ANÁLISE</span>
                    </div>
                    <form onSubmit={openDeal} className="flex flex-wrap gap-3 items-end">
                      <div className="flex-1 min-w-48">
                        <label htmlFor="deal-id" className="block text-sm font-semibold mb-1">
                          ID do negócio
                        </label>
                        <input
                          id="deal-id"
                          className="input w-full"
                          inputMode="numeric"
                          pattern="[1-9][0-9]*"
                          value={dealId}
                          onChange={(event) => setDealId(event.target.value)}
                          placeholder="Ex.: 10298"
                          required
                          disabled={!!busy}
                        />
                      </div>
                      <button className="primary" disabled={!!busy}>
                        <RefreshCw size={15} />
                        Analisar negócio
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={!!busy}
                        onClick={() => list()}
                      >
                        Consultar histórico
                      </button>
                    </form>
                    <p className="text-xs text-slate-500 mt-3">
                      Abra a análise salva ou informe um novo negócio para extrair o texto e
                      analisar automaticamente.
                    </p>
                  </div>
                </details>
              )}
              {page === 'home' && !snapshot && <WorkflowIntro />}
              {page === 'saved' && (
                <section className="card p-4">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">BIBLIOTECA DE NEGÓCIOS</span>
                      <h2>Versões salvas</h2>
                    </div>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => list(listOffset)}
                    >
                      <RefreshCw size={14} />
                      Atualizar
                    </button>
                  </div>
                  <label className="saved-search">
                    <Search size={18} />
                    <input
                      aria-label="Buscar nas extrações desta página"
                      placeholder="Buscar por negócio ou ID nesta página"
                      value={savedQuery}
                      onChange={(event) => setSavedQuery(event.target.value)}
                    />
                  </label>
                  {!saved.length && (
                    <div className="empty-state">
                      <FolderOpen size={34} />
                      <h3>
                        {busy === 'list'
                          ? 'Carregando suas extrações…'
                          : 'Seu histórico começa na primeira análise.'}
                      </h3>
                      <p>
                        As novas extrações ficam disponíveis aqui. Os registros da versão antiga
                        continuam preservados separadamente.
                      </p>
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() => setPage('home')}
                      >
                        Analisar um negócio
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  )}
                  {saved.length > 0 &&
                    !saved.some((row) =>
                      `${row.deal_id} ${row.title}`
                        .toLocaleLowerCase('pt-BR')
                        .includes(savedQuery.toLocaleLowerCase('pt-BR')),
                    ) && (
                      <p className="empty-state">
                        Nenhuma extração corresponde à busca nesta página.
                      </p>
                    )}
                  <div className="saved-list">
                    {saved
                      .filter((row) =>
                        `${row.deal_id} ${row.title}`
                          .toLocaleLowerCase('pt-BR')
                          .includes(savedQuery.toLocaleLowerCase('pt-BR')),
                      )
                      .map((row) => (
                        <button
                          disabled={!!busy}
                          onClick={() => load(row.id)}
                          key={row.id}
                          className="w-full text-left p-3 rounded-lg bg-slate-50 hover:bg-cyan-50 flex flex-wrap justify-between gap-2"
                        >
                          <span className="text-sm font-semibold">
                            #{row.deal_id} · {row.title}
                          </span>
                          <span className="text-xs text-slate-500">
                            {date(row.started_at)} · {statusLabel[row.status]}
                          </span>
                        </button>
                      ))}
                  </div>
                  <div className="flex justify-between mt-3">
                    <button
                      className="secondary"
                      disabled={!!busy || !listOffset}
                      onClick={() => list(Math.max(0, listOffset - 20))}
                    >
                      Anterior
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy || !hasMore}
                      onClick={() => list(listOffset + 20)}
                    >
                      Próxima
                    </button>
                  </div>
                </section>
              )}
              {snapshot && page === 'home' && (
                <>
                  <section className="card snapshot-card">
                    <div className="flex flex-wrap gap-3 justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-branddi-navy">{snapshot.title}</h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Deal #{snapshot.deal_id} ·{' '}
                          {snapshot.analysisReady && snapshot.status === 'collecting'
                            ? 'Texto pronto · anexos pendentes'
                            : statusLabel[snapshot.status]}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Referência:{' '}
                          {date(
                            snapshot.completed_at ||
                              snapshot.metrics?.referenceAt ||
                              snapshot.started_at,
                          )}
                        </p>
                      </div>
                      {snapshot.status !== 'collecting' && (
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => collect(undefined, String(snapshot.deal_id))}
                        >
                          <RefreshCw size={14} />
                          Nova extração
                        </button>
                      )}
                      {snapshot.status === 'collecting' && (
                        <button
                          className="secondary"
                          disabled={!!busy && busy !== 'extracting'}
                          onClick={() =>
                            busy === 'extracting' ? controller.current?.abort() : collect(snapshot)
                          }
                        >
                          {busy === 'extracting' ? 'Pausar coleta' : 'Retomar coleta'}
                        </button>
                      )}
                    </div>
                    {busy === 'extracting' && (
                      <p className="flex gap-2 mt-3 text-sm text-branddi-navy" role="status">
                        <Loader2 size={18} className="animate-spin" />
                        {snapshot.analysisReady
                          ? `Texto coletado. Preservando ${snapshot.pendingAttachments || snapshot.remainingTasks} arquivos em segundo plano…`
                          : 'Reunindo o texto do negócio, histórico, pessoas e e-mails…'}
                      </p>
                    )}
                    <details className="snapshot-coverage">
                      <summary>Detalhes e limites da coleta</summary>
                      <p className="text-xs text-slate-500 mt-3">
                        {snapshot.completed_tasks} etapas preservadas · {snapshot.remainingTasks}{' '}
                        pendentes
                        {snapshot.last_resource
                          ? ` · Último recurso: ${snapshot.last_resource}`
                          : ''}
                      </p>
                      <div className="snapshot-metrics">
                        {[
                          ['Dias no ciclo', snapshot.metrics?.daysOpen],
                          ['Dias sem contato registrado', snapshot.metrics?.daysInactive],
                          ['Contatos registrados', snapshot.metrics?.totalActions],
                          ['Atividades pendentes', snapshot.metrics?.pendingActivities],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <span>{label}</span>
                            <strong>{value ?? '—'}</strong>
                          </div>
                        ))}
                      </div>

                      <p>
                        {snapshot.metrics?.contactDefinition} Métricas calculadas em{' '}
                        {date(snapshot.metrics?.referenceAt)}.
                      </p>
                      <p>
                        Iniciada em {date(snapshot.started_at)}.{' '}
                        {snapshot.completed_at
                          ? `Finalizada em ${date(snapshot.completed_at)}.`
                          : 'A coleta completa ainda não foi concluída.'}
                      </p>
                      <CollectionGaps gaps={snapshot.gaps} />
                    </details>
                  </section>
                  {ready && (
                    <>
                      <BriefingDashboard
                        key={snapshot.id}
                        snapshot={snapshot}
                        records={versions}
                        record={currentBriefing}
                        onSelect={setSelectedBriefing}
                        onGenerate={() => analyze('overview')}
                        onSource={openSource}
                        onCopy={copy}
                        onAsk={(text) => {
                          setQuestion(text);
                          setSelectedAnswer(null);
                          requestAnimationFrame(() => document.getElementById('question')?.focus());
                        }}
                        configuration={configuration}
                        busy={Boolean(busy)}
                      />
                      <section
                        className="briefing-questions space-y-5"
                        aria-label="Perguntas sobre o briefing"
                      >
                        <h2>Perguntas sobre o briefing</h2>
                        <section className="card p-5">
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              void analyze('question');
                            }}
                            className="space-y-3"
                          >
                            <label htmlFor="question" className="block font-semibold">
                              O que você precisa saber sobre este negócio?
                            </label>
                            <textarea
                              id="question"
                              className="input w-full min-h-24"
                              maxLength={2000}
                              value={question}
                              onChange={(event) => setQuestion(event.target.value)}
                              placeholder="Qual foi o último compromisso assumido pelo cliente e onde isso está registrado?"
                              required
                            />
                            <button
                              className="primary"
                              disabled={!!busy || !configuration.analysisConfigured}
                            >
                              Perguntar
                            </button>
                          </form>
                        </section>
                        {answers.filter((answer) => answer.mode === 'question').length > 1 && (
                          <select
                            aria-label="Respostas anteriores"
                            className="input max-w-full"
                            value={currentAnswer?.id || ''}
                            onChange={(event) =>
                              setSelectedAnswer(
                                answers.find((answer) => answer.id === event.target.value),
                              )
                            }
                          >
                            {answers
                              .filter((answer) => answer.mode === 'question')
                              .map((answer) => (
                                <option key={answer.id} value={answer.id}>
                                  {date(answer.created_at)} · {answer.question}
                                </option>
                              ))}
                          </select>
                        )}
                        {currentAnswer && <AnswerPanel record={currentAnswer} onCopy={copy} />}
                      </section>
                      <details className="technical-data" key={`technical:${snapshot.id}`}>
                        <summary>Consulta técnica · dados preservados</summary>
                        {!sourceData && (
                          <button className="secondary" disabled={!!busy} onClick={viewSources}>
                            Carregar dados e fontes
                          </button>
                        )}
                        {sourceData && (
                          <EvidencePanel
                            key={snapshot.id}
                            snapshot={snapshot}
                            initialSources={sourceData}
                            onError={setError}
                          />
                        )}
                      </details>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {busy === 'analysis' && (
            <div
              role="status"
              className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-branddi-navy text-white shadow-xl rounded-xl p-4 flex items-center gap-3"
            >
              <Loader2 className="animate-spin" size={18} />
              Analisando as evidências e validando as citações…
            </div>
          )}
          {openedSource && (
            <SourceDialog source={openedSource} onClose={() => setOpenedSource(null)} />
          )}
        </main>
        <footer className="workspace-footer">
          <span>Branddi · CRM Intelligence</span>
          <span>Contexto preservado. Decisões bem informadas.</span>
        </footer>
      </div>
    </div>
  );
}
export default function App() {
  const { user, loading, error, login, logout } = useAuth();
  if (!supabase)
    return (
      <main className="max-w-xl mx-auto p-8">
        <h1 className="font-bold text-xl">Configurar CRM Intelligence</h1>
        <p className="mt-3">
          Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para iniciar o aplicativo. Consulte as
          instruções de instalação do projeto.
        </p>
      </main>
    );
  if (loading) return <p className="p-8 text-center">Carregando sessão…</p>;
  return (
    <>
      {error && (
        <p role="alert" className="bg-red-50 text-red-800 p-4">
          {error}
        </p>
      )}
      {user ? (
        <Workspace key={user.id} user={user} logout={logout} />
      ) : (
        <LoginScreen onLogin={login} />
      )}
    </>
  );
}
