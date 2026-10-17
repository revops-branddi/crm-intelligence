import { useState } from 'react';
import { apiRequest } from '../services/api';
export function EvidencePanel({ snapshot, initialSources, onError }) {
  const [query, setQuery] = useState(''),
    [sources, setSources] = useState(initialSources.sources),
    [total, setTotal] = useState(initialSources.total),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [raw, setRaw] = useState(null);
  async function search(nextOffset = 0) {
    setBusy(true);
    try {
      const result = await apiRequest('sources', {
        snapshotId: snapshot.id,
        query,
        offset: nextOffset,
      });
      setSources(result.sources);
      setTotal(result.total);
      setOffset(nextOffset);
      setRaw(null);
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function original(source) {
    setBusy(true);
    try {
      let offset = 0;
      const chunks = [];
      do {
        const result = await apiRequest('raw', {
          snapshotId: snapshot.id,
          taskKey: source.taskKey,
          offset,
        });
        if (result.page) {
          setRaw(result.page);
          return;
        }
        chunks.push(result.rawChunk);
        offset = result.nextOffset;
      } while (offset !== null);
      setRaw(JSON.parse(chunks.join('')));
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function download(source) {
    try {
      const result = await apiRequest('attachment', {
        snapshotId: snapshot.id,
        taskKey: source.taskKey,
      });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onError(error.message);
    }
  }
  function exportRaw() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-${snapshot.deal_id}-${raw.task_key}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
        className="flex flex-wrap gap-2"
      >
        <label className="sr-only" htmlFor="source-search">
          Pesquisar nos dados extraídos
        </label>
        <input
          id="source-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="input flex-1"
          placeholder="Pesquisar em todas as fontes"
        />
        <button disabled={busy} className="primary">
          Pesquisar
        </button>
      </form>
      <p className="text-xs text-slate-500">
        {total} trechos encontrados. Os originais incluem os campos e metadados retornados pelo CRM.
      </p>
      {raw && (
        <section className="card p-4">
          <div className="flex gap-3 justify-between">
            <h3 className="font-bold">Resposta original do CRM</h3>
            <button className="secondary" onClick={exportRaw}>
              Baixar JSON
            </button>
            <button onClick={() => setRaw(null)} aria-label="Fechar original">
              Fechar
            </button>
          </div>
          <pre className="overflow-auto max-h-96 text-xs mt-3 whitespace-pre-wrap break-all">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </section>
      )}
      {sources.map((source) => (
        <article key={source.id} id={source.id} className="card p-5">
          <div className="flex flex-wrap gap-3 justify-between">
            <div>
              <h3 className="font-bold">{source.title}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {source.kind} · registro {source.recordId} · parte {source.part + 1}
                {source.date ? ` · ${source.date}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="secondary" disabled={busy} onClick={() => original(source)}>
                Ver original
              </button>
              {source.kind === 'attachment' && (
                <button className="secondary" onClick={() => download(source)}>
                  Baixar arquivo
                </button>
              )}
            </div>
          </div>
          <pre className="mt-4 whitespace-pre-wrap break-words text-xs text-slate-600 max-h-80 overflow-auto">
            {source.text}
          </pre>
        </article>
      ))}
      <div className="flex justify-between">
        <button
          className="secondary"
          disabled={busy || offset === 0}
          onClick={() => search(Math.max(0, offset - 30))}
        >
          Anterior
        </button>
        <button
          className="secondary"
          disabled={busy || offset + 30 >= total}
          onClick={() => search(offset + 30)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
