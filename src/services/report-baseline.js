// Same age boundary as Report Engine; missing dates cannot establish freshness.
export function reportBaseline(report, days, now = Date.now()) {
  const generated = Date.parse(report?.generated_at);
  return {
    exists: Boolean(report),
    advertisers:
      Number.isInteger(report?.advertisers_count) && report.advertisers_count >= 0
        ? report.advertisers_count
        : null,
    generatedAt: Number.isFinite(generated) ? report.generated_at : null,
    expired:
      Boolean(report) && (!Number.isFinite(generated) || now - generated > Number(days) * 86400000),
    lookbackDays: Number(days),
    observedAt: new Date(now).toISOString(),
  };
}
