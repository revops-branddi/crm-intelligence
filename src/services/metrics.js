const DAY = 86400000;
export function parsePipedriveDate(value) {
  if (!value) return null;
  if (typeof value === 'number')
    return Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : null;
  if (typeof value !== 'string') return null;
  let normalized = value.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized += 'T00:00:00Z';
  else if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) normalized += 'Z';
  const result = Date.parse(normalized);
  return Number.isFinite(result) ? result : null;
}
export function getItemDate(item) {
  return (
    item?.data?.message_time || item?.data?.add_time || item?.timestamp || item?.add_time || null
  );
}
export function isActivityDone(item) {
  return [true, 1, '1', 'true'].includes(item?.data?.done ?? item?.data?.is_done);
}
export function getMeetingDate(item) {
  return item?.data?.due_date || item?.data?.marked_as_done_time || getItemDate(item);
}
function activityDate(item) {
  const data = item.data || {};
  return (
    data.marked_as_done_time ||
    (data.due_date ? `${data.due_date}T${data.due_time || '00:00:00'}Z` : null)
  );
}
function activityType(item) {
  return String(item.data?.type || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
function isContact(item) {
  return (
    ['mailMessage', 'mailMessageWithAttachment'].includes(item.object) ||
    (item.object === 'activity' &&
      isActivityDone(item) &&
      /call|email|linkedin|whatsapp|ligacao|meeting|reuniao/.test(activityType(item)))
  );
}
export function calculateHardMetrics(dealData, flowItems, now = Date.now()) {
  const deal = dealData?.data || {};
  const created = parsePipedriveDate(deal.add_time);
  const closed =
    deal.status === 'won'
      ? parsePipedriveDate(deal.won_time || deal.close_time)
      : deal.status === 'lost'
        ? parsePipedriveDate(deal.lost_time || deal.close_time)
        : null;
  const ended = deal.status === 'won' || deal.status === 'lost';
  const unique = [
    ...new Map(
      flowItems.map((item, index) => [
        `${item.object === 'mailMessageWithAttachment' ? 'mailMessage' : item.object}:${item.data?.id ?? item.id ?? `unknown-${index}`}`,
        item,
      ]),
    ).values(),
  ];
  const contactDate = (item) =>
    parsePipedriveDate(item.object === 'activity' ? activityDate(item) : getItemDate(item));
  const contacts = unique.filter(
    (item) => isContact(item) && (contactDate(item) === null || contactDate(item) <= now),
  );
  const contactDates = contacts
    .map((item) =>
      parsePipedriveDate(item.object === 'activity' ? activityDate(item) : getItemDate(item)),
    )
    .filter((date) => date !== null && date <= now);
  const latest = contactDates.length ? Math.max(...contactDates) : null;
  const meetings = contacts.filter(
    (item) =>
      item.object === 'activity' &&
      isActivityDone(item) &&
      /meeting|reuniao/.test(activityType(item)),
  );
  const details = (item) => ({
    date: getMeetingDate(item),
    timestamp: parsePipedriveDate(getMeetingDate(item)) || 0,
    subject: item.data?.subject || 'Sem assunto',
  });
  const outboundMeetings = meetings
    .filter((item) => /reuniao/.test(activityType(item)))
    .map(details)
    .sort((a, b) => b.timestamp - a.timestamp);
  const salesMeetings = meetings
    .filter((item) => !/reuniao/.test(activityType(item)))
    .map(details)
    .sort((a, b) => b.timestamp - a.timestamp);
  return {
    daysOpen:
      created && (!ended || closed)
        ? Math.max(0, Math.floor(((closed || now) - created) / DAY))
        : null,
    daysInactive: latest === null ? null : Math.max(0, Math.floor((now - latest) / DAY)),
    lastContactAt: latest === null ? null : new Date(latest).toISOString(),
    totalActions: contacts.length,
    pendingActivities: unique.filter((item) => item.object === 'activity' && !isActivityDone(item))
      .length,
    meetingsOutbound: outboundMeetings.length,
    meetingsSales: salesMeetings.length,
    outboundMeetings,
    salesMeetings,
    referenceAt: new Date(now).toISOString(),
    contactDefinition:
      'E-mail registrado ou atividade de contato concluída. Registro não comprova resposta do lead.',
  };
}
