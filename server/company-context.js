import { normalizeText } from './sources.js';
import { parsePipedriveDate } from '../src/services/metrics.js';

const keyOf = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const definitions = [
  [
    'group',
    'Grupo empresarial',
    /^(?:grupo empresarial|grupo economico|grupo|holding|faz parte de grupo)$/,
  ],
  ['name', 'Empresa', /^(?:nome|name)$/],
  ['website', 'Site', /^(?:site|website|dominio)$/],
  ['sector', 'Segmento', /^(?:setor|segmento|vertical)(?:\.\d+)?$/],
  ['legalName', 'Razão social', /^razao social$/],
  ['cnpj', 'CNPJ', /^cnpj$/],
  [
    'brands',
    'Marcas e vínculos registrados',
    /^(?:outras marcas do grupo|marcas do grupo|marca\(s\) encontradas)$/,
  ],
  ['scope', 'Abrangência', /^(?:alcance da marca|abrangencia|onde vende)$/],
  ['description', 'Atuação', /^(?:o que faz|resumo da marca)$/],
];
const empty = (value) =>
  !value ||
  /^(?:nao informado|nao localizado|nao identificado|a confirmar|null|undefined|\[object object\])/i.test(
    keyOf(value),
  );
function fields(source) {
  return source.text.split('\n').flatMap((quote) => {
    const match = quote.match(
      /^\s*(?:\*\s*)?(?:content:\s*)?(?:custom_fields\.)?(?:(?:LDR|SDR|Closer)\s*-\s*)?([^:]+):\s*(.*?)\s*$/i,
    );
    if (!match) return [];
    const definition = definitions.find(([, , pattern]) => pattern.test(keyOf(match[1].trim())));
    return definition
      ? [{ id: definition[0], label: definition[1], value: match[2], quote, source }]
      : [];
  });
}
function organizationId(source) {
  return (
    source.text.match(
      /^(?:Organização|org_id|organization_id)(?:\.(?:ID|id|value))?:\s*([1-9]\d*)\s*$/m,
    )?.[1] || null
  );
}
function sourceDate(source) {
  const updated = source.text.match(/^Atualizado em:\s*(.+)$/m)?.[1];
  return updated || source.date || null;
}

// This is a read-only projection of named fields, never an inferred corporate
// relationship. Organization identity is the CRM ID, not a brand/name match.
// Notes stay attributed to the current card and do not become master data.
export function companyContext(sources) {
  const dealSources = sources.filter((source) => source.kind === 'deal');
  const linkedId = dealSources.map(organizationId).find(Boolean) || null;
  const dealId = dealSources[0]?.recordId;
  const organization = sources.filter(
    (source) => source.kind === 'organization' && String(source.recordId) === linkedId,
  );
  const notes = sources.filter((source) => {
    const noteDeal = source.text.match(/^deal_id:\s*([1-9]\d*)\s*$/m)?.[1];
    return (
      source.kind === 'notes' &&
      (!organizationId(source) || organizationId(source) === linkedId) &&
      (!noteDeal || noteDeal === String(dealId))
    );
  });
  const rows = [...organization, ...notes].flatMap(fields);
  const populated = rows.filter(
    (row) =>
      !empty(row.value) &&
      (row.id !== 'website' ||
        /^(?:https?:\/\/)?(?:[\p{L}\d-]+\.)+[a-z]{2,}(?:[/:\s]|$)/iu.test(row.value)),
  );
  const facts = [];
  for (const [id, label] of definitions) {
    const candidates = populated.filter(
      (row) => row.id === id && (id !== 'name' || row.source.kind === 'organization'),
    );
    // Keep different recorded values visible; repeated notes contribute sources
    // without producing duplicate claims. Prefer the shared organization record.
    candidates.sort(
      (a, b) =>
        Number(b.source.kind === 'organization') - Number(a.source.kind === 'organization') ||
        (parsePipedriveDate(sourceDate(b.source)) || 0) -
          (parsePipedriveDate(sourceDate(a.source)) || 0),
    );
    const variants = new Map();
    for (const row of candidates) {
      const key = normalizeText(row.value).toLocaleLowerCase('pt-BR');
      if (!variants.has(key)) variants.set(key, []);
      variants.get(key).push(row);
    }
    for (const evidence of variants.values()) {
      const value = normalizeText(evidence[0].value);
      const origin = evidence[0].source.kind === 'organization' ? 'organization' : 'note';
      const recordedAt = sourceDate(evidence[0].source);
      const date = recordedAt && parsePipedriveDate(recordedAt);
      facts.push({
        key: `company:${id}:${facts.length}`,
        field: id,
        category: 'company',
        kind: 'fact',
        origin,
        recordedAt,
        text: `${label}: ${value}`,
        attribution:
          origin === 'organization'
            ? `Cadastro da organização #${linkedId}`
            : `Nota interna do card${date ? ` · ${new Date(date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}`,
        citations: evidence
          .slice(0, 3)
          .map((row) => ({ sourceId: row.source.id, quote: row.quote })),
      });
    }
  }
  const warnings = [];
  if (!linkedId)
    warnings.push(
      'O card não tem organização identificada nesta extração. Não foi inferido um vínculo pelo nome da empresa.',
    );
  if (linkedId && !organization.length)
    warnings.push(`O cadastro da organização #${linkedId} não está disponível nesta extração.`);
  if (
    !populated.some((row) => row.id === 'group' && row.source.kind === 'organization') &&
    facts.some((fact) => fact.field === 'group')
  )
    warnings.push(
      'O grupo não está preenchido no cadastro da organização; as informações de grupo abaixo constam nas notas deste card e precisam ser conferidas antes de atualizar a organização.',
    );
  const identity = facts.filter(
    (fact) =>
      fact.origin === 'organization' &&
      ['name', 'website', 'sector', 'legalName', 'cnpj'].includes(fact.field),
  );
  const consolidated = identity.length
    ? {
        ...identity[0],
        key: 'company:identity',
        field: 'identity',
        text: identity.map((fact) => fact.text).join(' · '),
        citations: identity.flatMap((fact) => fact.citations),
      }
    : null;
  const other = facts.filter((fact) => !identity.includes(fact));
  const group = other.find((fact) => fact.field === 'group');
  return {
    organizationId: linkedId,
    facts: [group, consolidated, ...other.filter((fact) => fact !== group)].filter(Boolean),
    warnings,
  };
}
