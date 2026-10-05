const NEGOTIATION_PATTERN = /propost|or[çc]amento|negocia|\bvalor\b|contrato|escopo|pricing|pre[çc]o|desconto/i;
const NON_ADVANCE_PATTERN = /sem or[çc]amento|sem budget|n[aã]o [ée] prioridade|sem retorno|j[aá] possui|fornecedor|perdid|n[aã]o avan[çc]|sem interesse|pausar|cancel/i;

const plainText = (value) => typeof value === 'string'
  ? value.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim()
  : '';

const valueId = (value) => {
  if (value && typeof value === 'object') return value.id || value.value || null;
  return value || null;
};

const eventDate = (item) => item?.object === 'activity'
  ? item.data?.due_date || item.data?.marked_as_done_time || item.data?.add_time || item.timestamp || item.add_time || ''
  : item?.data?.add_time || item?.timestamp || item?.add_time || '';

const eventKind = (item) => {
  if (item?.object === 'note') return 'Nota';
  if (item?.object === 'mailThread' || item?.object === 'mailMessage') return 'E-mail';
  if (item?.object !== 'activity') return 'Atualização do CRM';

  const type = String(item.data?.type || '').toLowerCase();
  if (type.includes('meeting') || type.includes('reuniao')) return 'Reunião';
  if (type.includes('whatsapp')) return 'WhatsApp';
  if (type.includes('linkedin')) return 'LinkedIn';
  if (type.includes('call') || type.includes('ligaç')) return 'Ligação';
  if (type.includes('email')) return 'E-mail';
  if (type.includes('task')) return 'Tarefa';
  return item.data?.type || 'Atividade';
};

const eventSummary = (item) => {
  if (item?.object === 'note') return plainText(item.data?.content) || 'Nota sem conteúdo.';
  if (item?.object === 'mailThread' || item?.object === 'mailMessage') {
    return [plainText(item.data?.subject), plainText(item.data?.snippet)].filter(Boolean).join(' — ') || 'E-mail sem assunto ou resumo.';
  }
  if (item?.object === 'activity') {
    return [plainText(item.data?.subject), plainText(item.data?.note)].filter(Boolean).join(' — ') || 'Atividade sem assunto ou detalhe.';
  }
  return [plainText(item?.data?.action), plainText(item?.data?.field_key), plainText(item?.data?.new_value)].filter(Boolean).join(' — ') || 'Atualização operacional sem detalhe legível.';
};

const eventStatus = (item) => {
  if (item?.object !== 'activity') return '';
  return item.data?.done === true || item.data?.done === 1 || item.data?.done === '1' || item.data?.done === 'true'
    ? 'Concluída'
    : 'Pendente';
};

const sourceFor = (item, kind, date) => `Pipedrive — ${kind.toLowerCase()} #${item?.data?.id || item?.id || 'sem ID'}${date ? ` — ${date}` : ''}`;

function participantMap(participants) {
  return new Map((participants || []).map(participant => {
    const id = valueId(participant?.person_id) || participant?.id;
    const name = participant?.name || participant?.person?.name || participant?.person_id?.name;
    return [id ? String(id) : '', name];
  }).filter(([id, name]) => id && name));
}

function activityParticipants(item, people) {
  const activityPeople = Array.isArray(item?.data?.participants) ? item.data.participants : [];
  return activityPeople
    .map(person => person?.name || person?.person_name || people.get(String(valueId(person?.person_id) || person?.id)))
    .filter(Boolean);
}

function timestamp(value) {
  if (!value) return 0;
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Creates a deterministic, source-backed commercial history from Pipedrive data.
 * It deliberately does not use the model: every displayed item maps to a concrete
 * Pipedrive record, and gaps remain visible instead of being inferred.
 */
export function buildCommercialHistory(dealData, participants, flowItems, usersMap = {}, { historyTruncated = false } = {}) {
  const people = participantMap(participants);
  const events = (flowItems || []).map(item => {
    const kind = eventKind(item);
    const date = eventDate(item);
    const userId = item?.data?.user_id || item?.data?.creator_user_id || item?.user_id;
    return {
      id: String(item?.data?.id || item?.id || ''),
      kind,
      date,
      timestamp: timestamp(date),
      status: eventStatus(item),
      summary: eventSummary(item),
      participants: item?.object === 'activity' ? activityParticipants(item, people) : [],
      responsible: usersMap[userId] || '',
      source: sourceFor(item, kind, date),
    };
  }).sort((first, second) => second.timestamp - first.timestamp);

  const meetings = events.filter(event => event.kind === 'Reunião');
  const negotiations = events.filter(event => NEGOTIATION_PATTERN.test(event.summary));
  const nonAdvanceReasons = events
    .filter(event => NON_ADVANCE_PATTERN.test(event.summary))
    .map(event => ({ reason: event.summary, date: event.date, source: event.source }));

  const lostReason = plainText(dealData?.data?.lost_reason);
  if (lostReason) {
    nonAdvanceReasons.unshift({
      reason: lostReason,
      date: dealData.data?.lost_time || dealData.data?.update_time || '',
      source: 'Pipedrive — campo oficial de motivo de perda do deal',
    });
  }

  return {
    version: 1,
    coverage: {
      totalFlowItems: events.length,
      historyTruncated,
      note: historyTruncated ? 'O Pipedrive retornou mais itens do que o limite carregado. Os eventos mais antigos podem não estar nesta análise.' : '',
    },
    meetings,
    participants: (participants || []).map(participant => ({
      name: participant?.name || participant?.person?.name || participant?.person_id?.name || 'Participante sem nome no CRM',
      role: participant?.job_title || '',
      email: Array.isArray(participant?.email) ? participant.email.map(value => value?.value || value).filter(Boolean).join(', ') : participant?.email || '',
      source: `Pipedrive — participante vinculado ao deal${participant?.id ? ` #${participant.id}` : ''}`,
    })),
    negotiations,
    interactions: events,
    nonAdvanceReasons,
  };
}
