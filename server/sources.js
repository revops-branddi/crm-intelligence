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
      const text =
        page.kind === 'attachment'
          ? `Arquivo: ${record.name}\nLeitura: ${record.textStatus}\n${record.text || record.note || ''}`
          : pretty(record, definitions);
      // Lossless text chunks: no prefix truncation. Originals remain in crm_raw_pages.
      const partSize = 6000;
      for (let start = 0; start < text.length; start += partSize) {
        const content = text.slice(start, start + partSize);
        sources.push({
          id: `${base}:${start / partSize}`,
          kind: page.kind,
          recordId: String(rawId),
          taskKey: page.task_key,
          part: start / partSize,
          date:
            record.message_time ||
            record.marked_as_done_time ||
            record.due_date ||
            record.add_time ||
            record.data?.add_time ||
            record.timestamp ||
            null,
          title: record.subject || record.title || record.name || `${page.kind} #${rawId}`,
          text: content,
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
export function selectContext(sources, question, maximum = 100000) {
  const terms = normalizeText(question)
    .toLocaleLowerCase('pt-BR')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2);
  const ranked = sources
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
  // Reserve room for the deal, organization, people, and every resource category.
  for (const kind of ['deal', 'organization', 'person', ...new Set(sources.map((s) => s.kind))]) {
    const first = ranked.find((entry) => entry.source.kind === kind);
    if (first) add(first.source);
  }
  for (const entry of ranked) add(entry.source);
  return {
    sources: selected,
    manifest: {
      totalChunks: sources.length,
      selectedChunks: selected.length,
      omittedChunks: sources.length - selected.length,
      characters: used,
      selection: 'lexical-relevance-and-recency-v1',
      sourceIds: selected.map((s) => s.id),
    },
  };
}
