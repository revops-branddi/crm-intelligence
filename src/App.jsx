import { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Database,
  FileText,
  MessageSquare,
  Search,
  RefreshCw,
  Loader2,
  LogOut,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './hooks/useAuth';
import { apiRequest } from './services/api';
import { LoginScreen } from './components/ui/LoginScreen';
import { AnswerPanel } from './components/AnswerPanel';
import { EvidencePanel } from './components/EvidencePanel';
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
const tabs = [
  ['overview', 'Visão geral', Database],
  ['prospecting', 'Prospecção', Search],
  ['briefing', 'Pré-reunião', FileText],
  ['question', 'Perguntas', MessageSquare],
  ['sources', 'Dados e fontes', Database],
];
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
    [question, setQuestion] = useState(''),
    [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [sourceData, setSourceData] = useState(null),
    [openedSource, setOpenedSource] = useState(null);
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
      setSnapshot(result.snapshot);
      setAnswers(history.answers);
      setSelectedAnswer(null);
      setSourceData(null);
      setOpenedSource(null);
      setTab('overview');
      setDealId(result.snapshot.deal_id);
      setNotice('Versão histórica carregada. Use “Nova extração” para atualizar os dados.');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy('');
    }
  }
  async function collect(existing) {
    setError('');
    setNotice('');
    setBusy('extracting');
    controller.current = new AbortController();
    const signal = controller.current.signal;
    try {
      let current =
        existing || (await apiRequest('start', { dealId: dealId.trim() }, signal)).snapshot;
      setSnapshot(current);
      setAnswers([]);
      setSelectedAnswer(null);
      setSourceData(null);
      setOpenedSource(null);
      setTab('overview');
      let retries = 0;
      while (current.status === 'collecting') {
        try {
          current = (await apiRequest('step', { snapshotId: current.id }, signal)).snapshot;
          if (!mounted.current) return;
          setSnapshot(current);
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
      setNotice('Dados preservados. Escolha Prospecção, Pré-reunião ou faça uma pergunta.');
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
  async function analyze(mode) {
    setBusy('analysis');
    setError('');
    controller.current = new AbortController();
    try {
      const result = await apiRequest(
        'answer',
        { snapshotId: snapshot.id, mode, question: mode === 'question' ? question : '' },
        controller.current.signal,
      );
      if (mounted.current) {
        setAnswers((previous) => [result.answer, ...previous]);
        setSelectedAnswer(result.answer);
        setTab(mode);
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
    setBusy('sources');
    setError('');
    try {
      setSourceData(await apiRequest('sources', { snapshotId: snapshot.id }));
      setTab('sources');
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy('');
    }
  }
  async function openSource(id) {
    setError('');
    try {
      const result = await apiRequest('source', { snapshotId: snapshot.id, sourceId: id });
      setOpenedSource(result.source);
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
  const ready = snapshot && ['complete', 'partial'].includes(snapshot.status);
  const currentAnswer =
    selectedAnswer?.mode === tab ? selectedAnswer : answers.find((answer) => answer.mode === tab);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-branddi-navy text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3 items-center">
          <Zap className="text-branddi-cyan" />
          <div>
            <h1 className="font-bold">CRM Intelligence</h1>
            <p className="text-xs text-slate-300">Branddi · Prospecção e preparação de reuniões</p>
          </div>
        </div>
        <div className="flex gap-4 items-center text-xs">
          <span>{user.email}</span>
          <button
            onClick={() => {
              controller.current?.abort();
              void logout();
            }}
            className="flex gap-1 items-center"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-5">
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
          <section className="card p-6 max-w-xl">
            <h2 className="text-lg font-bold">Conectar ao Pipedrive</h2>
            <p className="text-sm text-slate-500 mt-2">
              Use o token da sua conta. As consultas respeitam a visibilidade dos negócios nessa
              conta. O token será criptografado no servidor.
            </p>
            <form onSubmit={configure} className="mt-4 space-y-3">
              <label htmlFor="pipedrive-token" className="block text-sm font-semibold">
                Token Pipedrive
              </label>
              <input
                id="pipedrive-token"
                type="password"
                autoComplete="off"
                className="input w-full"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
                minLength={20}
              />
              <button disabled={!!busy} className="primary">
                Conectar
              </button>
            </form>
          </section>
        )}
        {configuration?.connection && (
          <>
            <section className="card p-5">
              <div className="flex justify-between gap-3 items-center mb-4">
                <p className="text-xs text-emerald-700 font-semibold">
                  Pipedrive conectado · conta {configuration.connection.company_id}
                </p>
                <button
                  disabled={!!busy}
                  onClick={disconnect}
                  className="text-xs text-slate-500 underline"
                >
                  Desconectar
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void collect();
                }}
                className="flex flex-wrap gap-3 items-end"
              >
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
                  Nova extração
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => list()}
                >
                  Extrações salvas
                </button>
              </form>
              <p className="text-xs text-slate-500 mt-3">
                Cada extração cria uma nova versão. O histórico original permanece preservado.
              </p>
            </section>
            {(saved.length > 0 || hasMore || listOffset > 0) && (
              <section className="card p-4">
                <h2 className="font-bold mb-3">Versões salvas</h2>
                <div className="space-y-2">
                  {saved.map((row) => (
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
            {snapshot && (
              <>
                <section className="card p-5">
                  <div className="flex flex-wrap gap-3 justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-branddi-navy">{snapshot.title}</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Deal #{snapshot.deal_id} · {statusLabel[snapshot.status]}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Coleta iniciada: {date(snapshot.started_at)} · Finalizada:{' '}
                        {date(snapshot.completed_at)}
                      </p>
                    </div>
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
                  <p className="text-xs text-slate-500 mt-3">
                    {snapshot.completed_tasks} etapas preservadas · {snapshot.remainingTasks}{' '}
                    pendentes
                    {snapshot.last_resource ? ` · Último recurso: ${snapshot.last_resource}` : ''}
                  </p>
                  {busy === 'extracting' && (
                    <p className="flex gap-2 mt-3 text-sm text-branddi-navy" role="status">
                      <Loader2 size={18} className="animate-spin" />
                      Coletando e preservando os dados…
                    </p>
                  )}
                  {!!snapshot.gaps?.length && (
                    <details
                      className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3"
                      open
                    >
                      <summary className="font-semibold text-sm text-amber-900">
                        {snapshot.gaps.length} {snapshot.gaps.length === 1 ? 'lacuna' : 'lacunas'}{' '}
                        na coleta ou leitura
                      </summary>
                      <ul className="list-disc pl-5 text-xs mt-2 space-y-2">
                        {snapshot.gaps.map((gap, i) => (
                          <li key={i}>
                            {{
                              attachment: 'Anexo',
                              mail: 'E-mail',
                              organization: 'Empresa',
                              person: 'Pessoa',
                              notes: 'Notas',
                              activities: 'Atividades',
                              flow: 'Histórico',
                              deal: 'Negócio',
                              files: 'Arquivos',
                            }[gap.resource] || gap.resource}
                            : {gap.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
                {ready && (
                  <>
                    <nav className="flex overflow-x-auto gap-2" aria-label="Visões do negócio">
                      {tabs.map(([id, label, Icon]) => (
                        <button
                          disabled={!!busy}
                          key={id}
                          onClick={() =>
                            id === 'sources' ? viewSources() : (setTab(id), setSelectedAnswer(null))
                          }
                          className={`flex whitespace-nowrap items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold ${tab === id ? 'bg-branddi-navy text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                        >
                          <Icon size={16} />
                          {label}
                        </button>
                      ))}
                    </nav>
                    {tab === 'overview' && (
                      <div className="space-y-5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            ['Dias no ciclo', snapshot.metrics?.daysOpen],
                            ['Dias desde contato registrado', snapshot.metrics?.daysInactive],
                            ['Contatos registrados', snapshot.metrics?.totalActions],
                            ['Atividades pendentes', snapshot.metrics?.pendingActivities],
                          ].map(([label, value]) => (
                            <div className="card p-4" key={label}>
                              <p className="text-xs text-slate-500">{label}</p>
                              <p className="text-2xl font-bold mt-2">{value ?? 'Sem evidência'}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500">
                          {snapshot.metrics?.contactDefinition} Métricas calculadas em{' '}
                          {date(snapshot.metrics?.referenceAt)}. Uma nova extração atualiza essa
                          referência.
                        </p>
                        <section className="card p-6">
                          <h2 className="font-bold">Preparar a próxima conversa</h2>
                          <p className="text-sm text-slate-500 mt-2">
                            Consulte as fontes, prepare a abordagem ou gere um briefing antes da
                            reunião. As respostas mostram fatos, inferências, recomendações e
                            lacunas separadamente.
                          </p>
                          <div className="flex flex-wrap gap-3 mt-4">
                            <button
                              disabled={!!busy || !configuration.analysisConfigured}
                              className="primary"
                              onClick={() => analyze('briefing')}
                            >
                              Gerar briefing
                            </button>
                            <button
                              disabled={!!busy || !configuration.analysisConfigured}
                              className="secondary"
                              onClick={() => analyze('prospecting')}
                            >
                              Preparar prospecção
                            </button>
                          </div>
                        </section>
                      </div>
                    )}
                    {['briefing', 'prospecting', 'question'].includes(tab) && (
                      <div className="space-y-5">
                        <section className="card p-5">
                          {tab === 'question' ? (
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
                                Responder com fontes
                              </button>
                            </form>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <h2 className="font-bold">
                                {tab === 'briefing'
                                  ? 'Preparação da reunião'
                                  : 'Preparação da prospecção'}
                              </h2>
                              <button
                                className="primary"
                                disabled={!!busy || !configuration.analysisConfigured}
                                onClick={() => analyze(tab)}
                              >
                                Gerar nova análise desta versão
                              </button>
                            </div>
                          )}
                          <p className="mt-3 text-xs text-slate-500">
                            Modelo: {configuration.model || 'não configurado'}. A análise usa a
                            versão coletada em {date(snapshot.completed_at)}.
                          </p>
                          {!configuration.analysisConfigured && (
                            <p className="mt-2 text-sm text-amber-800">
                              Configure o modelo e a chave de IA no servidor para habilitar as
                              respostas.
                            </p>
                          )}
                        </section>
                        {answers.filter((answer) => answer.mode === tab).length > 1 && (
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
                              .filter((answer) => answer.mode === tab)
                              .map((answer) => (
                                <option key={answer.id} value={answer.id}>
                                  {date(answer.created_at)} ·{' '}
                                  {answer.question || 'Análise desta versão'}
                                </option>
                              ))}
                          </select>
                        )}
                        <AnswerPanel record={currentAnswer} onSource={openSource} onCopy={copy} />
                      </div>
                    )}
                    {tab === 'sources' && sourceData && (
                      <EvidencePanel
                        key={snapshot.id}
                        snapshot={snapshot}
                        initialSources={sourceData}
                        onError={setError}
                      />
                    )}
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
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Fonte da resposta"
          >
            <div className="bg-white rounded-xl p-6 max-w-3xl w-full max-h-[85vh] overflow-auto">
              <div className="flex justify-between gap-3">
                <h2 className="font-bold">{openedSource.title}</h2>
                <button className="secondary" onClick={() => setOpenedSource(null)}>
                  Fechar
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">{openedSource.id}</p>
              <pre className="whitespace-pre-wrap break-words mt-4 text-sm">
                {openedSource.text}
              </pre>
            </div>
          </div>
        )}
      </main>
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
