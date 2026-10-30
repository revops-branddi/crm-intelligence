import { useEffect, useRef, useState } from 'react';
import { Building2, ArrowUpRight, RefreshCw, ChevronRight, ClipboardCheck } from 'lucide-react';
import { apiRequest } from '../services/api';
import { draftForReview, helpdeskDraftUrl, HUB_HELPDESK } from '../services/briefing';
import { DetailSheet } from './DetailSheet';

const labels = {
  open: 'Pendente',
  in_progress: 'Em andamento',
  resolved: 'Concluída',
  dismissed: 'Não se aplica',
};
const date = (value) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const openTask = (task) => task.active && ['open', 'in_progress'].includes(task.status);
function Assignee({ value, onChange, people }) {
  return (
    <label className="draft-field">
      Responsável
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Escolha o responsável</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function ScopeForm({ data, onSave, busy }) {
  const initial = data.scope || data.defaults;
  const [form, setForm] = useState({
    ...initial,
    brands: initial.brands.join('; '),
    domains: initial.domains.join('; '),
  });
  const [assigneeId, setAssigneeId] = useState(
    data.scope?.assignee?.id || data.defaultAssignee?.id || '',
  );
  const field = (name, value) => setForm((old) => ({ ...old, [name]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave('saveScope', {
          revision: data.revision,
          assigneeId,
          scope: {
            kind: form.kind,
            brands: form.brands
              .split(';')
              .map((v) => v.trim())
              .filter(Boolean),
            domains: form.domains
              .split(';')
              .map((v) => v.trim().toLowerCase())
              .filter(Boolean),
            product: form.product,
            maxAgeDays: Number(form.maxAgeDays),
          },
        });
      }}
    >
      <p className="briefing-note">
        Defina o que esta negociação abrange. Pertencer a um grupo não inclui automaticamente as
        outras marcas.
      </p>
      <label className="draft-field">
        Abrangência da negociação
        <select className="input" value={form.kind} onChange={(e) => field('kind', e.target.value)}>
          <option value="brand">Uma marca</option>
          <option value="group">Grupo / várias marcas</option>
        </select>
      </label>
      <label className="draft-field">
        Marcas incluídas
        <input
          className="input"
          required
          value={form.brands}
          maxLength={1000}
          onChange={(e) => field('brands', e.target.value)}
          placeholder="Separe as marcas por ponto e vírgula"
        />
      </label>
      <label className="draft-field">
        Domínios incluídos
        <input
          className="input"
          required
          value={form.domains}
          maxLength={1000}
          onChange={(e) => field('domains', e.target.value)}
          placeholder="marca.com.br; outra.com.br"
        />
      </label>
      <label className="draft-field">
        Produto
        <input
          className="input"
          required
          value={form.product}
          maxLength={160}
          onChange={(e) => field('product', e.target.value)}
        />
      </label>
      <Assignee value={assigneeId} onChange={setAssigneeId} people={data.assignees} />
      <details className="coverage-details">
        <summary>Atualização dos materiais</summary>
        <label className="draft-field">
          Idade máxima em dias
          <input
            className="input"
            type="number"
            min="1"
            max="365"
            required
            value={form.maxAgeDays}
            onChange={(e) => field('maxAgeDays', e.target.value)}
          />
        </label>
        <p>30 dias é o valor inicial. Ajuste conforme o caso.</p>
      </details>
      <p className="briefing-muted">
        Esta confirmação orienta a preparação neste aplicativo. O cadastro do Pipedrive permanece
        separado.
      </p>
      <button className="primary" disabled={busy || data.readOnly} type="submit">
        {busy ? 'Salvando…' : 'Salvar escopo'}
      </button>
    </form>
  );
}
function TaskForm({ task, data, snapshot, busy, onSave, onSource }) {
  const initialDraft =
    task.draft ||
    draftForReview(
      {
        ...task,
        expected: 'Dados e materiais coerentes com o escopo confirmado.',
        impact: 'Preparação comercial e prospecção da marca correta.',
      },
      snapshot,
    );
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id || '');
  const [status, setStatus] = useState(task.status);
  const [note, setNote] = useState(task.note || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [draft, setDraft] = useState(initialDraft);
  const [approve, setApprove] = useState(false);
  const approved = task.approval && JSON.stringify(draft) === JSON.stringify(task.draft);
  const hub = approved && helpdeskDraftUrl(draft);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave('savePreparationTask', {
          revision: data.revision,
          taskId: task.id,
          assigneeId,
          status,
          note,
          dueDate,
          approveHelpdesk: task.kind === 'issue' && approve,
          approveRecommendation: task.kind === 'recommendation' && approve,
          ...(task.kind === 'issue' ? { draft } : {}),
        });
      }}
    >
      <p className="briefing-note">{task.found}</p>
      {task.changedEvidence && (
        <p className="status-pill warning">Dados alterados · revisão necessária</p>
      )}
      <Assignee value={assigneeId} onChange={setAssigneeId} people={data.assignees} />
      <div className="workflow-form-grid">
        <label className="draft-field">
          Status
          <select
            className="input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setApprove(false);
            }}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="draft-field">
          Prazo
          <input
            className="input"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
      </div>
      <label className="draft-field">
        Observação da revisão
        <textarea
          className="input"
          rows={3}
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="O que foi conferido e qual é a próxima ação?"
        />
      </label>
      <p className="briefing-muted">
        Conclusões e descartes exigem uma observação. Revisão salva na sua conta; atribuir
        responsável não envia notificações.
      </p>
      {!!task.citations?.length && (
        <details className="coverage-details">
          <summary>Evidências da ocorrência</summary>
          {task.citations.map((ref, i) => (
            <div key={i} className="workflow-evidence">
              <q>{ref.quote}</q>
              {ref.sourceId !== 'material-verificado' && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => onSource(ref.sourceId, ref.quote)}
                >
                  Conferir registro
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {task.kind === 'issue' && (
        <details className="coverage-details" open={Boolean(task.approval)}>
          <summary>Chamado individual no Hub RevOps</summary>
          <p>Confirme o erro e aprove esta ocorrência. A abertura será confirmada no Hub.</p>
          <label className="draft-field">
            Título do chamado
            <input
              className="input"
              value={draft.title}
              maxLength={200}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="draft-field">
            Descrição do chamado
            <textarea
              className="input"
              rows={6}
              value={draft.description}
              maxLength={3800}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          {!['resolved', 'dismissed'].includes(status) && (
            <label className="preparation-check">
              <input
                type="checkbox"
                checked={approve}
                onChange={(e) => setApprove(e.target.checked)}
              />
              <span>Confirmo este erro e aprovo somente este chamado.</span>
            </label>
          )}
          {hub && (
            <div className="briefing-note">
              <p>
                Aprovado em {date(task.approval.at)}. O chamado só existe após confirmação no Hub.
              </p>
              <a className="primary" href={hub} target="_blank" rel="noopener noreferrer">
                Continuar no Hub <ArrowUpRight size={14} />
              </a>
            </div>
          )}
          <a
            className="text-action"
            href={`${HUB_HELPDESK}/meus`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Consultar meus chamados
          </a>
        </details>
      )}
      {task.kind === 'recommendation' && (
        <div className="briefing-note">
          {!['resolved', 'dismissed'].includes(status) && (
            <label className="preparation-check">
              <input
                type="checkbox"
                checked={approve}
                onChange={(e) => setApprove(e.target.checked)}
              />
              <span>Revisei e aprovo somente esta recomendação.</span>
            </label>
          )}
          <p>
            {task.recommendationApproval
              ? `Aprovada em ${date(task.recommendationApproval.at)}. `
              : ''}
            A aprovação registra a decisão. A execução deve ser solicitada no Hub; nenhuma
            monitoria, relatório ou alteração no CRM é disparada aqui.
          </p>
        </div>
      )}
      <button type="submit" className="primary" disabled={busy || data.readOnly || !task.active}>
        {busy
          ? 'Salvando…'
          : approve
            ? task.kind === 'recommendation'
              ? 'Salvar e aprovar recomendação'
              : 'Salvar e aprovar este chamado'
            : 'Salvar pendência'}
      </button>
      <details className="coverage-details">
        <summary>Histórico desta pendência</summary>
        {data.history
          .filter((event) => event.taskId === task.id)
          .slice(-10)
          .reverse()
          .map((event, i) => (
            <p key={i}>
              {date(event.at)} · {event.actor}
              <br />
              {event.text}
              {event.note && (
                <>
                  <br />
                  {event.note}
                </>
              )}
            </p>
          ))}
      </details>
    </form>
  );
}

export function PreparationWorkflow({
  snapshot,
  record,
  view,
  onNavigate,
  onPendingCount,
  onSource,
}) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [retry, setRetry] = useState(0),
    [notice, setNotice] = useState('');
  const attemptedChecks = useRef(new Set());
  const [validating, setValidating] = useState(false);
  useEffect(() => {
    let active = true;
    apiRequest('preparation', { snapshotId: snapshot.id })
      .then((result) => {
        if (active) {
          setData(result);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [snapshot.id, record?.id, retry]);
  useEffect(() => {
    onPendingCount(data?.tasks.filter(openTask).length || 0);
  }, [data, onPendingCount]);
  useEffect(() => {
    if (!data || data.readOnly || selected || busy || validating || view !== 'materials') return;
    const material = data.materials.find(
      (item) =>
        (!item.validation || item.validation.stale) &&
        !attemptedChecks.current.has(`${item.key}:${JSON.stringify(data.scope || data.defaults)}`),
    );
    if (!material) return;
    attemptedChecks.current.add(`${material.key}:${JSON.stringify(data.scope || data.defaults)}`);
    void (async () => {
      setValidating(true);
      try {
        const result = await apiRequest('validateMaterial', {
          snapshotId: snapshot.id,
          materialKey: material.key,
        });
        setData((previous) =>
          previous && previous.revision > result.revision ? previous : result,
        );
      } catch (e) {
        setError(e.message);
      } finally {
        setValidating(false);
      }
    })();
  }, [data, view, selected, busy, validating, snapshot.id]);
  const mutate = async (action, input, close = true) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest(action, { snapshotId: snapshot.id, ...input });
      setData(result);
      setNotice(action === 'validateMaterial' ? 'Verificação salva.' : 'Preparação salva.');
      if (close) setSelected(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const pending = data?.tasks.filter(openTask) || [];
  const selectedTask = data?.tasks.find((task) => task.id === selected);
  const select = (task) => setSelected(task.kind === 'scope' ? 'scope' : task.id);
  const errors = error && (
    <div role="alert" className="briefing-note">
      {error}{' '}
      <button
        className="text-action"
        type="button"
        disabled={busy}
        onClick={() => {
          setSelected(null);
          setRetry((r) => r + 1);
        }}
      >
        Atualizar preparação
      </button>
    </div>
  );
  if (!data)
    return (
      <section className="workflow-status">
        {errors || <p role="status">Carregando preparação salva…</p>}
      </section>
    );
  const activeTasks = data.tasks.filter((task) => task.active);
  return (
    <>
      {!selected && errors}
      {!selected && notice && (
        <p className="workflow-saved" role="status">
          {notice}
        </p>
      )}
      {data.readOnly && (
        <p className="briefing-note">
          Preparação vinculada a uma extração mais recente. Abra essa versão para editar.
        </p>
      )}
      {view === 'briefing' && (
        <>
          {!!data.operations?.length && (
            <p className="briefing-muted" aria-label="Consultas operacionais">
              {data.operations
                .map((item) => `${item.source}: ${item.label} · ${date(item.checkedAt)}`)
                .join(' | ')}
            </p>
          )}
          {data.group && (
            <section className="workflow-group" aria-label="Aviso de grupo">
              <Building2 size={22} />
              <div>
                <strong>Empresa de grupo · {data.group.label}</strong>
                <p>
                  {data.scope
                    ? `Escopo: ${data.scope.brands.join(', ')} · ${data.scope.product}`
                    : 'Escopo comercial ainda não confirmado.'}
                  {data.group.registrationPending
                    ? ' Vínculo consta nas notas; cadastro a conferir.'
                    : ''}
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => setSelected('scope')}
                disabled={busy || data.readOnly}
              >
                {data.scope ? 'Revisar escopo' : 'Definir escopo'}
              </button>
            </section>
          )}
          <section className="workflow-summary" aria-label="Preparação do negócio">
            <div className="briefing-section-heading">
              <strong>
                <ClipboardCheck size={16} />{' '}
                {pending.length
                  ? `${pending.length} pendências de preparação`
                  : 'Preparação revisada'}
              </strong>
              <button className="text-action" onClick={() => onNavigate('reviews')}>
                Ver pendências <ChevronRight size={14} />
              </button>
            </div>
            {!data.group && (
              <button
                className="text-action"
                disabled={busy || data.readOnly}
                onClick={() => setSelected('scope')}
              >
                {data.scope
                  ? `Escopo: ${data.scope.brands.join(', ')} · revisar`
                  : 'Definir escopo comercial'}
              </button>
            )}
          </section>
        </>
      )}
      {view === 'materials' && (
        <section className="briefing-section">
          <div className="briefing-section-heading">
            <div>
              <h2>Relatórios e materiais</h2>
              <p>Leitura automática de marca, domínio, produto e data ao abrir esta área.</p>
            </div>
            <button
              className="secondary"
              disabled={busy || data.readOnly}
              onClick={() => setSelected('scope')}
            >
              {data.scope ? 'Revisar escopo' : 'Definir escopo'}
            </button>
          </div>
          {!data.materials.length && (
            <p className="briefing-note">
              Nenhum link registrado nesta versão. As pendências de preparação estão salvas.
            </p>
          )}
          <div className="material-grid">
            {data.materials.map((material) => {
              const check = material.validation,
                current = check && !check.stale;
              return (
                <article className="material-card" key={material.key}>
                  <h3>{material.title}</h3>
                  <span
                    className={`status-pill ${current && check.status === 'compatible' ? '' : 'warning'}`}
                  >
                    {current
                      ? {
                          compatible: 'Texto compatível · revisão final pendente',
                          attention: 'Requer ajuste ou confirmação',
                          pending: 'Revisão necessária',
                        }[check.status]
                      : check
                        ? 'Verificação desatualizada'
                        : 'Ainda não verificado'}
                  </span>
                  <p>{new URL(material.url).hostname}</p>
                  {check && (
                    <>
                      <small>Verificado em {date(check.checkedAt)}</small>
                      <ul className="material-findings">
                        {check.checks
                          .filter((c) => c.status !== 'pass')
                          .map((c) => (
                            <li key={c.key}>{c.message}</li>
                          ))}
                      </ul>
                      <details className="coverage-details">
                        <summary>Resultado da verificação</summary>
                        {check.checks.map((c) => (
                          <p key={c.key}>
                            {c.status === 'pass' ? '✓ ' : '· '}
                            {c.message}
                          </p>
                        ))}
                        <p>{check.summary}</p>
                      </details>
                    </>
                  )}
                  <div className="material-actions">
                    <button
                      className="primary"
                      disabled={busy || validating || data.readOnly}
                      onClick={() =>
                        void mutate('validateMaterial', { materialKey: material.key }, false)
                      }
                    >
                      <RefreshCw size={14} />
                      {busy || validating ? 'Verificando…' : 'Verificar conteúdo'}
                    </button>
                    <a
                      className="secondary"
                      href={material.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir material <ArrowUpRight size={14} />
                    </a>
                    <button className="text-action" onClick={() => setSelected(material.key)}>
                      Revisar pendência
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="briefing-muted">
            Verificações valem por 24 horas e precisam ser refeitas após mudança de escopo. Imagens,
            gráficos, envio e adequação comercial exigem revisão final.
          </p>
        </section>
      )}
      {view === 'reviews' && (
        <section className="briefing-section">
          <div className="briefing-section-heading">
            <div>
              <h2>Pendências e erros</h2>
              <p>Responsável, decisão e histórico salvos por negócio.</p>
            </div>
            <span className="status-pill">{pending.length} pendentes</span>
          </div>
          <div className="workflow-task-list">
            {activeTasks.filter(openTask).map((task) => (
              <article key={task.id}>
                <div>
                  <span className="status-pill warning">{labels[task.status]}</span>
                  <h3>{task.title}</h3>
                  <p>{task.found}</p>
                  <small>
                    {task.assignee?.name || 'Sem responsável'}
                    {task.dueDate ? ` · Prazo: ${task.dueDate}` : ''}
                    {task.approval ? ' · Chamado aprovado para revisão no Hub' : ''}
                    {task.recommendationApproval
                      ? ' · Recomendação aprovada; execução pendente'
                      : ''}
                  </small>
                </div>
                <button className="secondary" onClick={() => select(task)}>
                  Revisar pendência <ChevronRight size={14} />
                </button>
              </article>
            ))}
          </div>
          {!pending.length && (
            <p className="briefing-note">Nenhuma pendência aberta nesta revisão.</p>
          )}
          <details className="coverage-details">
            <summary>
              Concluídas e versões anteriores ({data.tasks.filter((t) => !openTask(t)).length})
            </summary>
            {data.tasks
              .filter((t) => !openTask(t))
              .map((task) => (
                <button className="workflow-row" key={task.id} onClick={() => select(task)}>
                  <span>{task.title}</span>
                  <small>{task.active ? labels[task.status] : 'Versão anterior'}</small>
                </button>
              ))}
          </details>
        </section>
      )}
      {selected && (
        <DetailSheet
          title={
            selected === 'scope' ? 'Escopo da negociação' : selectedTask?.title || 'Preparação'
          }
          subtitle={selected === 'scope' ? 'Marca, grupo e produto' : 'Uma decisão por pendência'}
          onClose={() => {
            if (!busy) {
              setSelected(null);
              setError('');
            }
          }}
        >
          {errors}
          {selected === 'scope' ? (
            <ScopeForm key="scope" data={data} busy={busy} onSave={mutate} />
          ) : (
            selectedTask && (
              <TaskForm
                key={selectedTask.id}
                task={selectedTask}
                data={data}
                snapshot={snapshot}
                busy={busy}
                onSave={mutate}
                onSource={(id, quote) => {
                  setSelected(null);
                  onSource(id, quote);
                }}
              />
            )
          )}
        </DetailSheet>
      )}
    </>
  );
}
