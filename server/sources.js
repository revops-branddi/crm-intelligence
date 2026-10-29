import { createHash } from 'node:crypto';
import { convert } from 'html-to-text';
import { calculateHardMetrics, parsePipedriveDate } from '../src/services/metrics.js';
export const normalizeText = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
export function readable(value) {
  if (typeof value !== 'string') return value;
  return /<[a-z][\s\S]*>/i.test(value)
    ? convert(value, {
        wordwrap: false,
        selectors: [{ selector: 'a', options: { ignoreHref: false } }],
      })
    : value;
}
function pretty(value, definitions, prefix = '') {
  if (value === null || value === undefined) return `${prefix}: não informado`;
  if (typeof value !== 'object') return `${prefix}: ${readable(value)}`;
  return Object.entries(value)
    .map(([key, entry]) => {
      const field = definitions.get(key);
      let decoded = entry;
      if (field?.options && entry !== null) {
        const options = new Map(field.options.map((o) => [String(o.id), o.label]));
        const values = Array.isArray(entry) ? entry : String(entry).split(',');
        decoded = values.map((v) => options.get(String(v)) || v);
      }
      return pretty(decoded, definitions, `${prefix ? prefix + '.' : ''}${field?.name || key}`);
    })
    .join('\n');
}
export function buildSources(pages) {
  const definitions = new Map();
  for (const page of pages)
    if (/Fields$/.test(page.kind))
      for (const field of page.payload?.data || [])
        definitions.set(field.key || field.field_code, {
          ...field,
          name: field.name || field.field_name,
        });
  const sources = [];
  for (const page of pages) {
    if (page.failure || !page.payload) continue;
    const data = page.payload.data;
    const records = Array.isArray(data) ? data : [data];
    for (const [index, record] of records.entries()) {
      if (record === null || record === undefined) continue;
      const rawId = record.id || record.data?.id || index;
      const base = `${page.kind}:${page.task_key.slice(0, 12)}:${rawId}`;
      const text = ['attachment', 'attachmentText', 'materialText'].includes(page.kind)
        ? `Arquivo: ${record.name}${record.url ? `\nURL: ${record.url}\nConsultado em: ${record.readAt}` : ''}\nLeitura: ${record.textStatus}\n${record.text || record.note || ''}`
        : pretty(record, definitions);
      // Lossless text chunks: no prefix truncation. Originals remain in crm_raw_pages.
      const partSize = 6000;
      for (let start = 0; start < text.length; start += partSize) {
        const content = text.slice(start, start + partSize);
        sources.push({
          id: `${base}:${start / partSize}`,
          kind:
            page.kind === 'attachmentText'
              ? 'attachment'
              : page.kind === 'materialText'
                ? 'material'
                : page.kind,
          entityKind:
            record.object ||
            {
              notes: 'note',
              activities: 'activity',
              mailIndex: 'mailMessage',
              mail: 'mailMessage',
            }[page.kind] ||
            page.kind,
          primary: page.kind !== 'flow',
          attachmentStatus: ['attachment', 'attachmentText', 'materialText'].includes(page.kind)
            ? record.textStatus
            : undefined,
          fileId: record.fileId,
          materialUrl: page.kind === 'materialText' ? record.url : undefined,
          contentHash:
            ['attachment', 'attachmentText', 'materialText'].includes(page.kind) && record.text
              ? createHash('sha256').update(record.text).digest('hex')
              : undefined,
          substantive: String(record.note || record.content || record.body || '').length,
          interactionType: record.type || record.data?.type,
          recordId: String(rawId),
          taskKey: page.task_key,
          part: start / partSize,
          date:
            record.readAt ||
            record.message_time ||
            record.data?.message_time ||
            record.marked_as_done_time ||
            record.due_date ||
            record.add_time ||
            record.data?.add_time ||
            record.timestamp ||
            null,
          title: record.subject || record.title || record.name || `${page.kind} #${rawId}`,
          text: content,
          ...(page.kind === 'deal'
            ? {
                ownerId:
                  record.owner_id?.id ||
                  record.owner_id ||
                  record.user_id?.id ||
                  record.user_id ||
                  null,
              }
            : {}),
          hash: createHash('sha256').update(content).digest('hex'),
        });
      }
    }
  }
  return sources;
}
export function snapshotMetrics(pages, referenceAt) {
  const deal = pages.find((p) => p.kind === 'deal')?.payload || { data: {} };
  const items = [];
  for (const page of pages) {
    const data = page.payload?.data;
    if (page.kind === 'flow') items.push(...(data || []));
    if (page.kind === 'activities')
      items.push(...(data || []).map((activity) => ({ object: 'activity', data: activity })));
    if (page.kind === 'mail' && data) items.push({ object: 'mailMessage', data });
  }
  return calculateHardMetrics(deal, items, Date.parse(referenceAt));
}
export function selectContext(sources, question, maximum = 100000, recentPerKind = 0) {
  const terms = normalizeText(question)
    .toLocaleLowerCase('pt-BR')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
  const ownerId = sources.find((source) => source.kind === 'deal')?.ownerId;
  const canonical = new Set(
    sources.filter((s) => s.primary && s.recordId).map((s) => `${s.entityKind}:${s.recordId}`),
  );
  const readFiles = new Set(
    sources
      .filter((s) => s.attachmentStatus === 'readable' && s.fileId)
      .map((s) => String(s.fileId)),
  );
  const latestMaterial = new Map();
  for (const s of sources.filter((s) => s.materialUrl)) {
    const previous = latestMaterial.get(s.materialUrl);
    if (!previous || Date.parse(s.date) > Date.parse(previous.date))
      latestMaterial.set(s.materialUrl, s);
  }
  const candidates = sources
    .filter(
      (source) =>
        !/Fields$/.test(source.kind) &&
        (!source.materialUrl ||
          latestMaterial.get(source.materialUrl)?.taskKey === source.taskKey) &&
        !(source.primary === false && canonical.has(`${source.entityKind}:${source.recordId}`)) &&
        !(
          source.attachmentStatus &&
          source.attachmentStatus !== 'readable' &&
          readFiles.has(String(source.fileId))
        ) &&
        (source.kind !== 'users' || (ownerId && String(source.recordId) === String(ownerId))),
    )
    .map((source) => ({
      ...source,
      text: source.text
        .split('\n')
        .filter((line) => !/: não informado$/.test(line))
        .join('\n'),
    }));
  const ranked = candidates
    .map((source) => ({
      source,
      score: terms.reduce(
        (score, term) => score + (source.text.toLocaleLowerCase('pt-BR').includes(term) ? 1 : 0),
        0,
      ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (parsePipedriveDate(b.source.date) || 0) - (parsePipedriveDate(a.source.date) || 0),
    );
  const selected = [],
    seen = new Set();
  let used = 0;
  function add(source) {
    const cost = JSON.stringify(source).length;
    if (!seen.has(source.id) && used + cost <= maximum) {
      selected.push(source);
      seen.add(source.id);
      used += cost;
    }
  }
  // Keep every meaningful field of the deal/company and the contact map ahead
  // of general activity history. Directory entries are not evidence of ownership.
  for (const kind of ['deal', 'organization', 'users', 'person'])
    for (const source of candidates.filter((source) => source.kind === kind)) add(source);
  for (const kind of ['notes', 'activities', 'mailIndex', 'flow', 'attachment']) {
    const first = ranked.find((entry) => entry.source.kind === kind);
    if (first) add(first.source);
  }
  // Broad analyses need the latest primary records as well as lexical matches.
  // Otherwise an older, verbose internal summary can crowd out a new reply.
  const recent = [...candidates].sort(
    (a, b) => (parsePipedriveDate(b.date) || 0) - (parsePipedriveDate(a.date) || 0),
  );
  for (const kind of ['mailIndex', 'notes', 'activities'])
    for (const source of recent
      .filter((source) => source.kind === kind)
      .slice(0, kind === 'mailIndex' && recentPerKind >= 5 ? 1 : recentPerKind))
      add(source);
  if (recentPerKind >= 5) {
    // Round-robin across readable files before long domain tables. Re-exported
    // identical cells are counted once in context, while all originals remain saved.
    const representative = new Map();
    const attachments = recent.filter(
      (s) => ['attachment', 'material'].includes(s.kind) && s.attachmentStatus === 'readable',
    );
    for (const s of attachments)
      if (!representative.has(s.contentHash || s.taskKey))
        representative.set(s.contentHash || s.taskKey, s.taskKey);
    let quota = used + maximum * 0.2;
    for (const source of attachments
      .filter((s) => representative.get(s.contentHash || s.taskKey) === s.taskKey)
      .sort((a, b) => a.part - b.part))
      if (used + JSON.stringify(source).length <= quota) add(source);
    // Protect the commercial history from bulk cadence messages. All parts of
    // consolidated notes remain eligible; a later import date is not an event date.
    quota = used + maximum * 0.4;
    for (const { source } of ranked.filter((e) => e.source.kind === 'notes'))
      if (used + JSON.stringify(source).length <= quota) add(source);
    quota = used + maximum * 0.2;
    const conversations = candidates
      .filter(
        (s) =>
          s.kind === 'activities' &&
          !/\[auto\]/i.test(s.title || '') &&
          /whatsapp|resposta|reuniao|meeting|call|ligacao/i.test(
            s.interactionType || s.title || '',
          ),
      )
      .sort(
        (a, b) =>
          (b.substantive || 0) - (a.substantive || 0) ||
          (parsePipedriveDate(b.date) || 0) - (parsePipedriveDate(a.date) || 0),
      );
    for (const source of conversations)
      if (used + JSON.stringify(source).length <= quota) add(source);
  }
  for (const entry of ranked) add(entry.source);
  return {
    sources: selected,
    manifest: {
      totalChunks: sources.length,
      selectedChunks: selected.length,
      omittedChunks: sources.length - selected.length,
      characters: used,
      selection: 'primary-commercial-history-and-readable-files-v4',
      sourceIds: selected.map((s) => s.id),
    },
  };
}
