export function ReportBaseline({ baseline }) {
  if (!baseline) return null;
  return (
    <section className="report-baseline" aria-label="Versão publicada antes da aprovação">
      <dl className="project-scope">
        <div>
          <dt>Antes · anunciantes publicados</dt>
          <dd>
            {baseline.exists ? (baseline.advertisers ?? 'Não informado') : 'Sem versão anterior'}
          </dd>
        </div>
        <div>
          <dt>Gerado em</dt>
          <dd>
            {baseline.generatedAt
              ? new Date(baseline.generatedAt).toLocaleString('pt-BR')
              : 'Data não informada'}
          </dd>
        </div>
      </dl>
      <p className="briefing-muted">
        {!baseline.exists
          ? 'O resultado será publicado após as verificações de qualidade.'
          : baseline.expired
            ? `Versão fora da janela de ${baseline.lookbackDays} dias ou sem data confirmada. Evidências atuais podem substituir a versão anterior mesmo com menos anunciantes. O piso de qualidade permanece: com menos de 5 anunciantes válidos na monitoria, o Report Engine pode manter a versão anterior.`
            : 'Dentro da janela: preserva a versão anterior se houver perda de volume ou qualidade. Prioriza anunciantes distintos e desempata por anúncios.'}
      </p>
    </section>
  );
}
