/**
 * Data Processor Service
 * Transforms raw Pipedrive data into structured JSON + compiled text for AI
 *
 * KEY PRINCIPLE: Never discard data. rawData preserves the original Pipedrive object.
 * The structured fields are organized views, not filters.
 */

import { parsePipedriveDate, getItemDate } from './metrics';

/**
 * Classify a flow item into a semantic type
 */
function classifyItem(item) {
  if (item.object === 'note') return 'note';
  if (item.object === 'mailThread' || item.object === 'mailMessage') return 'email';
  if (item.object === 'activity') return 'activity';
  return 'update';
}

/**
 * Extract structured content based on item type
 */
function extractContent(item, type) {
  switch (type) {
    case 'note': {
      const rawContent = typeof item.data?.content === 'string' ? item.data.content : '';
      return {
        text: rawContent.replace(/<[^>]*>?/gm, ''),
        html: rawContent,
      };
    }
    case 'email':
      return {
        subject: item.data?.subject || '',
        snippet: item.data?.snippet || '',
        from: item.data?.from?.email_address || '',
        to: item.data?.to?.map(t => t.email_address).filter(Boolean) || [],
      };
    case 'activity':
      return {
        type: item.data?.type || '',
        subject: item.data?.subject || '',
        done: !!(item.data?.done === true || item.data?.done === 1 || item.data?.done === '1' || item.data?.done === 'true'),
        note: typeof item.data?.note === 'string' ? item.data.note.replace(/<[^>]*>?/gm, '') : '',
        noteHtml: item.data?.note || '',
        dueDate: item.data?.due_date || '',
        dueTime: item.data?.due_time || '',
        duration: item.data?.duration || '',
        participants: item.data?.participants || [],
      };
    default:
      return {
        action: item.data?.action || item.object || '',
        field: item.data?.field_key || '',
        oldValue: item.data?.old_value || '',
        newValue: item.data?.new_value || '',
      };
  }
}

/**
 * Build SDR breakdown from flow items
 */
function buildSdrBreakdown(flowItems, usersMap) {
  const breakdown = {};

  flowItems.forEach(item => {
    const userId = item.data?.user_id || item.data?.creator_user_id || item.user_id;
    const sdrName = userId && usersMap[userId] ? usersMap[userId] : null;
    if (!sdrName) return;

    if (!breakdown[sdrName]) {
      breakdown[sdrName] = { count: 0, channels: new Set(), lastActivity: null };
    }

    breakdown[sdrName].count++;

    // Track channels
    if (item.object === 'mailThread' || item.object === 'mailMessage') {
      breakdown[sdrName].channels.add('email');
    } else if (item.object === 'activity') {
      const t = (item.data?.type || '').toLowerCase();
      if (t.includes('linkedin')) breakdown[sdrName].channels.add('linkedin');
      else if (t.includes('whatsapp')) breakdown[sdrName].channels.add('whatsapp');
      else if (t.includes('call') || t.includes('ligação')) breakdown[sdrName].channels.add('phone');
      else if (t.includes('email')) breakdown[sdrName].channels.add('email');
      else if (t.includes('meeting') || t.includes('reuniao')) breakdown[sdrName].channels.add('meeting');
      else breakdown[sdrName].channels.add(t || 'other');
    }

    // Track last activity
    const itemDate = parsePipedriveDate(getItemDate(item));
    if (!breakdown[sdrName].lastActivity || (itemDate && itemDate > parsePipedriveDate(breakdown[sdrName].lastActivity))) {
      breakdown[sdrName].lastActivity = getItemDate(item);
    }
  });

  // Convert Sets to arrays for JSON serialization
  const result = {};
  for (const [name, data] of Object.entries(breakdown)) {
    result[name] = {
      count: data.count,
      channels: Array.from(data.channels),
      lastActivity: data.lastActivity,
    };
  }

  return result;
}

/**
 * Process raw Pipedrive data into structured JSON
 * Preserves ALL original data via rawData fields
 */
export function processToStructured(dealData, participantsData, flowItems, usersMap, metrics) {
  const participants = (participantsData.data || []).map(p => ({
    name: p.name || '',
    email: Array.isArray(p.email) ? p.email.map(e => e.value || e) : (p.email ? [p.email] : []),
    phone: Array.isArray(p.phone) ? p.phone.map(ph => ph.value || ph) : (p.phone ? [p.phone] : []),
    org_name: p.org_name || '',
    job_title: p.job_title || '',
    linkedin: p.linkedin || '',
    whatsapp: p.whatsapp || '',
    label: p.label || '',
    tags: p.tags || '',
    rawData: p,
  }));

  const timeline = flowItems.map(item => {
    const type = classifyItem(item);
    const userId = item.data?.user_id || item.data?.creator_user_id || item.user_id;
    const sdrName = userId && usersMap[userId] ? usersMap[userId] : null;

    return {
      type,
      date: getItemDate(item),
      dateTimestamp: parsePipedriveDate(getItemDate(item)),
      sdr: sdrName,
      content: extractContent(item, type),
      rawData: item,
    };
  });

  // Sort timeline by date descending (most recent first)
  timeline.sort((a, b) => b.dateTimestamp - a.dateTimestamp);

  const sdrBreakdown = buildSdrBreakdown(flowItems, usersMap);

  return {
    deal: {
      id: dealData.data.id,
      title: dealData.data.title,
      status: dealData.data.status,
      stage_id: dealData.data.stage_id,
      pipeline_id: dealData.data.pipeline_id,
      add_time: dealData.data.add_time,
      update_time: dealData.data.update_time,
      value: dealData.data.value,
      currency: dealData.data.currency,
      org_id: dealData.data.org_id,
      person_id: dealData.data.person_id,
      user_id: dealData.data.user_id,
      owner_name: dealData.data.owner_name,
      rawData: dealData.data,
    },
    participants,
    timeline,
    sdrBreakdown,
    metadata: {
      fetchedAt: new Date().toISOString(),
      totalItems: flowItems.length,
      daysOpen: metrics.daysOpen,
      daysInactive: metrics.daysInactive,
      totalActions: metrics.totalActions,
    },
  };
}

/**
 * Compile structured data into text format for the Gemini AI prompt
 * Maintains backward compatibility with current text format
 */
export function compileToText(structuredData, dealId) {
  const { deal, participants, timeline, sdrBreakdown, metadata } = structuredData;

  const dataAtual = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });

  let text = `--- DATA DE REFERÊNCIA (HOJE) ---\n`;
  text += `${dataAtual}\n\n`;
  text += `--- DADOS DO NEGÓCIO E MÉTRICAS EXATAS ---\n`;
  text += `ID do Negócio: ${dealId}\n`;
  text += `Título: ${deal.title}\n`;
  text += `Dias no Funil (Aberto há): ${metadata.daysOpen} dias\n`;
  text += `Dias sem Contato (Email/WhatsApp/LinkedIn/Call): ${metadata.daysInactive} dias\n`;
  text += `Total de Interações Registradas: ${metadata.totalActions}\n\n`;

  // Participants
  text += `\n--- PARTICIPANTES VINCULADOS ---\n`;
  if (participants.length > 0) {
    participants.forEach(p => {
      const emails = p.email.join(', ');
      text += `- Nome: ${p.name} | Email: ${emails}\n`;
    });
  }

  // SDR breakdown
  const sdrNames = Object.keys(sdrBreakdown);
  if (sdrNames.length > 0) {
    text += `\n--- SDRs QUE TOCARAM ESTE DEAL ---\n`;
    sdrNames.forEach(name => {
      text += `- ${name} (${sdrBreakdown[name].count} interações)\n`;
    });
  }

  // Timeline (chronological order for AI — sort ascending)
  text += `\n--- HISTÓRICO DE ATIVIDADES ---\n`;
  const chronological = [...timeline].sort((a, b) => a.dateTimestamp - b.dateTimestamp);

  chronological.forEach(item => {
    let dateStr = 'Data desconhecida';
    if (item.dateTimestamp) {
      try {
        dateStr = new Date(item.dateTimestamp).toLocaleDateString('pt-PT');
      } catch { /* keep fallback */ }
    } else if (item.date) {
      dateStr = item.date;
    }

    const sdrTag = item.sdr ? `[SDR: ${item.sdr}] ` : '';

    switch (item.type) {
      case 'note':
        text += `[${dateStr}] ${sdrTag}NOTA: ${item.content.text}\n`;
        break;
      case 'activity':
        text += `[${dateStr}] ${sdrTag}ATIVIDADE | Tipo: [${item.content.type}] | Assunto: [${item.content.subject}] | Estado: ${item.content.done ? 'Concluída' : 'Pendente'}\n`;
        if (item.content.note) {
          text += `   Detalhes: ${item.content.note}\n`;
        }
        break;
      case 'email':
        text += `[${dateStr}] ${sdrTag}E-MAIL: Assunto: ${item.content.subject}\n`;
        if (item.content.snippet) {
          text += `   Resumo: ${item.content.snippet}\n`;
        }
        break;
      default:
        // Updates/changes — include for completeness
        break;
    }
  });

  return text;
}
