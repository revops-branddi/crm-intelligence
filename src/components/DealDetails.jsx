import { useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
export function DealDetails({ snapshotId, mode, onSource }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [offset, setOffset] = useState(0),
    [query, setQuery] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    apiRequest('details', { snapshotId, offset })
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
  }, [snapshotId, offset, retry]);
  if (error)
    return (
      <div role="alert" className="card p-5">
        {error}
        <button className="secondary ml-3" onClick={() => setRetry((n) => n + 1)}>
          Tentar novamente
        </button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="card p-5">
        Carregando os registros preservados…
      </p>
    );
  if (mode === 'timeline')
    return (
      <section className="card p-6">
        <div className="section-heading">
          <div>
            <span className="eyebrow">HISTÓRICO REGISTRADO</span>
            <h2>{data.totalEvents} eventos comerciais</h2>
          </div>
          <span className="muted">Mais recentes primeiro</span>
        </div>
        <div className="event-timeline">
          {data.timeline.map((event, i) => (
            <article key={`${event.id}:${i}`}>
              <span className="event-dot" />
              <p className="event-meta">
                {event.date
                  ? new Date(event.date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                  : 'Sem data'}{' '}
                · {event.kind}
                {event.author && ` · ${event.author}`}
              </p>
              <h3>{event.title}</h3>
              <p className="event-text">
                {event.text || 'Consulte os campos do registro na fonte original.'}
              </p>
              {event.sourceId && (
                <button className="secondary" onClick={() => onSource(event.sourceId)}>
                  Abrir fonte
                </button>
              )}
            </article>
          ))}
        </div>
        {!data.totalEvents && (
          <p className="empty-state">
            Nenhuma nota, atividade ou mensagem disponível nesta versão.
          </p>
        )}
        <div className="flex justify-between mt-5">
          <button
            className="secondary"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Anterior
          </button>
          <button
            className="secondary"
            disabled={offset + 30 >= data.totalEvents}
            onClick={() => setOffset(offset + 30)}
          >
            Próxima
          </button>
        </div>
      </section>
    );
  const people = data.people.filter((person) =>
    `${person.name} ${person.email} ${person.role}`
      .toLocaleLowerCase('pt-BR')
      .includes(query.toLocaleLowerCase('pt-BR')),
  );
  return (
    <div className="space-y-5">
      <section className="card p-6">
        <span className="eyebrow">EMPRESA NO CRM</span>
        <h2 className="text-xl font-semibold">{data.company?.name || 'Empresa não informada'}</h2>
        {data.company && (
          <details className="company-fields">
            <summary>Consultar todos os campos da empresa</summary>
            <dl>
              {data.company.fields.map((field, i) => (
                <div key={i}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </section>
      <section className="card p-6">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MAPA DE CONTATOS</span>
            <h2>{data.people.length} pessoas vinculadas</h2>
          </div>
        </div>
        <label className="saved-search">
          <input
            aria-label="Buscar pessoa"
            placeholder="Buscar por nome, cargo ou e-mail"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="people-grid">
          {people.map((person) => (
            <article key={person.id}>
              <span className="person-avatar">{person.name?.slice(0, 1) || '?'}</span>
              <div>
                <h3>{person.name}</h3>
                <p>{person.role || 'Cargo não registrado'}</p>
                <p>{person.email || 'E-mail não registrado'}</p>
                {person.phone && <p>{person.phone}</p>}
              </div>
            </article>
          ))}
        </div>
        {!people.length && <p className="empty-state">Nenhuma pessoa encontrada.</p>}
      </section>
    </div>
  );
}
