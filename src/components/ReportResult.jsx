const count = (value) => (Number.isInteger(value) && value >= 0 ? value : null);

export function ReportResult({ job, reports = [] }) {
  if (!job || !['completed', 'preserved'].includes(job.status)) return null;
  // CRM stores the original project receipt, including its nested result.
  const receipt = job.result?.result;
  // Legacy receipt volumes count rows for the quality guard, not the public KPI.
  const comparison =
    receipt?.publishedComparison?.metric === 'effective_advertisers_v1'
      ? receipt.publishedComparison
      : null;
  const sameVersion = reports.find(
    (r) =>
      r.slug === job.parameters.slug &&
      Number.isFinite(Date.parse(r.generated_at)) &&
      Date.parse(r.generated_at) === Date.parse(receipt?.generatedAt),
  );
  const before = count(comparison?.before);
  const after = count(comparison?.after) ?? count(sameVersion?.advertisers_count);
  const difference = before !== null && after !== null ? after - before : null;
  return (
    <section className="report-comparison" aria-label="Resultado do relatório">
      <div className="report-section-heading">
        <h3>{job.status === 'preserved' ? 'Versão anterior mantida' : 'Relatório atualizado'}</h3>
        {receipt?.generatedAt && (
          <small>Versão publicada: {new Date(receipt.generatedAt).toLocaleString('pt-BR')}</small>
        )}
      </div>
      <dl className="report-comparison-values">
        <div>
          <dt>Antes</dt>
          <dd>{before ?? 'Não informado'}</dd>
          <small>Anunciantes distintos</small>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <dt>Depois · publicado</dt>
          <dd>{after ?? 'Não informado'}</dd>
          <small>Anunciantes distintos</small>
        </div>
      </dl>
      <p>
        {job.status === 'preserved'
          ? 'A versão anterior foi preservada pela regra de volume e qualidade.'
          : difference === null
            ? comparison
              ? 'O recibo não informa a comparação completa.'
              : 'Recibo antigo: a contagem publicada anterior não está disponível.'
            : difference > 0
              ? `+${difference} ${difference === 1 ? 'anunciante distinto' : 'anunciantes distintos'} no relatório.`
              : difference === 0
                ? 'Mesmo número de anunciantes distintos.'
                : `${Math.abs(difference)} ${difference === -1 ? 'anunciante' : 'anunciantes'} a menos na versão publicada.`}
      </p>
      {receipt?.lookbackDays && (
        <small>
          Últimos {receipt.lookbackDays} dias ·{' '}
          {receipt.campaignIds?.length ?? job.parameters.campaignIds.length} coletas incluídas
        </small>
      )}
    </section>
  );
}
