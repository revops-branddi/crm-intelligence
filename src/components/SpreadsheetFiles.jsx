import { useEffect, useState } from 'react';
import { apiRequest } from '../services/api';

export function SpreadsheetFiles({ snapshotId, record }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    let active = true;
    apiRequest('spreadsheets', { snapshotId })
      .then((result) => {
        if (active) setFiles(result.files);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [snapshotId, record?.id]);
  async function read() {
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest('readSpreadsheets', { snapshotId });
      setFiles(result.files);
      setUpdated(result.processed > 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!files.length && !error) return null;
  const pending = files.some((file) => file.status !== 'readable' && !file.readerVersion);
  return (
    <section className="briefing-section" aria-label="Planilhas do card">
      <div className="briefing-section-heading">
        <h3>Planilhas do card</h3>
        <span className="status-pill">
          {files.filter((f) => f.status === 'readable').length}/{files.length} lidas
        </span>
      </div>
      <p className="briefing-muted">
        Abas e células entram na análise. A data da evidência pode ser anterior à exportação.
      </p>
      <ul className="spreadsheet-files">
        {files.map((file) => (
          <li key={file.id}>
            <span>{file.name}</span>
            <span className="status-pill">
              {file.status === 'readable'
                ? 'Texto disponível'
                : file.status === 'pending'
                  ? 'Em coleta'
                  : 'Leitura pendente'}
            </span>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
      {updated && (
        <p role="status">Planilhas lidas. Atualize o briefing para incluir as evidências.</p>
      )}
      {pending && (
        <button className="secondary" disabled={busy} onClick={read}>
          {busy ? 'Lendo planilhas…' : 'Ler planilhas preservadas'}
        </button>
      )}
    </section>
  );
}
