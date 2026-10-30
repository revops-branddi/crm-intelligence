// Use completed captures within the chosen window. Creation time alone does not prove freshness.
export function reportCampaigns(campaigns, days, now = Date.now()) {
  const since = now - Number(days) * 86400000;
  return campaigns.filter(
    (c) =>
      c.queued_tasks === 0 &&
      !c.executions.some((e) => ['pending', 'running'].includes(e.status)) &&
      c.executions.some((e) => {
        const finished = Date.parse(e.finished_at);
        return (
          ['completed', 'low_volume'].includes(e.status) &&
          finished >= since &&
          finished <= now &&
          e.planned_tasks > 0 &&
          e.queue_completed_tasks >= e.planned_tasks &&
          e.terminal_queue_failures === 0
        );
      }),
  );
}
export const reportKeywords = (campaigns) => [
  ...new Set(campaigns.flatMap((c) => c.configuration.keywords || [])),
];
