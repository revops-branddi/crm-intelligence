import { createHash } from 'node:crypto';
import { readMaterial } from './material-reader.js';

export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const normalize = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
export const scopeDigest = (scope) =>
  digest(
    scope && [
      scope.kind,
      scope.brands,
      scope.domains,
      scope.product,
      scope.maxAgeDays,
      scope.organizationId,
      Boolean(scope.confirmedAt),
    ],
  );
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function mentions(text, term) {
  return new RegExp(`(?:^|[^a-z0-9])${escape(normalize(term))}(?:$|[^a-z0-9])`, 'i').test(
    normalize(text),
  );
}
function datedEvidence(text) {
  const matches = [
    ...text.matchAll(
      /(?:gerado(?: em)?|atualizado(?: em)?|data(?: do relat[oó]rio| de refer[eê]ncia|-base)?|per[ií]odo)\s*[:·-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4})/gi,
    ),
  ];
  return matches
    .map((match) => {
      const raw = match[1];
      const written = normalize(raw).match(/^(\d{1,2}) de ([a-z]+) de (\d{4})$/);
      const months = [
        'janeiro',
        'fevereiro',
        'marco',
        'abril',
        'maio',
        'junho',
        'julho',
        'agosto',
        'setembro',
        'outubro',
        'novembro',
        'dezembro',
      ];
      const value = written
        ? `${written[3]}-${String(months.indexOf(written[2]) + 1).padStart(2, '0')}-${written[1].padStart(2, '0')}`
        : raw.includes('/')
          ? raw.split('/').reverse().join('-')
          : raw;
      const date = new Date(`${value}T12:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value)
        ? { value, quote: match[0] }
        : null;
    })
    .filter(Boolean);
}
export function inspectMaterial(document, scope, now = new Date()) {
  const checks = [];
  const add = (key, status, message, quote = '') =>
    checks.push({ key, status, message, quote: quote.slice(0, 700) });
  const text = document.text || '';
  if (text.trim().length < 80) {
    add('content', 'pending', 'Conteúdo insuficiente para conferir. Abra e revise o material.');
    return checks;
  }
  add('content', 'pass', 'Conteúdo lido.', document.title);
  const missingBrands = scope.brands.filter((brand) => !mentions(text, brand));
  // Mere matches in ads/competitor lists do not establish the report's subject.
  const subject = `${document.title}\n${text.slice(0, 1400)}`;
  if (missingBrands.length)
    add(
      'brand',
      'attention',
      `Marcas do escopo não identificadas: ${missingBrands.join(', ')}. Conferir conteúdo.`,
      document.title,
    );
  else if (!scope.brands.some((brand) => mentions(subject, brand)))
    add(
      'brand',
      'pending',
      'Marca aparece no texto, mas o assunto do material não está claro.',
      document.title,
    );
  else add('brand', 'pass', `Marcas encontradas: ${scope.brands.join(', ')}.`, document.title);
  const missingDomains = scope.domains.filter((domain) => !mentions(text, domain));
  if (!scope.domains.length)
    add('domain', 'pending', 'Defina os domínios esperados para conferir a cobertura.');
  else if (missingDomains.length)
    add('domain', 'attention', `Domínios não encontrados: ${missingDomains.join(', ')}.`);
  else add('domain', 'pass', 'Domínios do escopo presentes.');
  if (!scope.product) add('product', 'pending', 'Produto não definido no escopo.');
  else if (!mentions(text, scope.product))
    add('product', 'pending', `Produto “${scope.product}” não identificado no texto.`);
  else add('product', 'pass', `Produto identificado: ${scope.product}.`);
  if (/^https:\/\/report\.branddi\.com\/[a-zA-Z0-9_.-]+\/gd\/?$/.test(document.url || '')) {
    add(
      'date',
      'pending',
      'GD é uma visão dinâmica. A data exibida na página é da consulta ao agregado; confirme o período das evidências.',
    );
    return checks;
  }
  const dates = datedEvidence(text);
  const unique = [...new Set(dates.map((d) => d.value))];
  if (!dates.length)
    add('date', 'pending', 'Data do material não identificada. Confirme a atualização.');
  else if (unique.length > 1)
    add(
      'date',
      'pending',
      'Mais de uma data de referência. Confirme o período correto.',
      dates.map((d) => d.quote).join('; '),
    );
  else {
    const age = (now - new Date(`${unique[0]}T12:00:00Z`)) / 86400000;
    add(
      'date',
      age < -1 || age > scope.maxAgeDays ? 'attention' : 'pass',
      age < -1
        ? `Data futura: ${unique[0]}.`
        : age > scope.maxAgeDays
          ? `Material de ${unique[0]} excede ${scope.maxAgeDays} dias. Atualize ou justifique a revisão.`
          : `Referência: ${unique[0]} · dentro de ${scope.maxAgeDays} dias.`,
      dates[0].quote,
    );
  }
  return checks;
}
export async function validateMaterial(
  material,
  scope,
  { read = readMaterial, now = new Date() } = {},
) {
  const result = {
    url: material.url,
    title: material.title,
    checkedAt: now.toISOString(),
    scopeHash: scopeDigest(scope),
  };
  try {
    const document = await read(material.url);
    const checks = inspectMaterial(document, scope, now);
    return {
      ...result,
      contentHash: digest(document.text),
      checks,
      status: checks.some((c) => c.status === 'attention')
        ? 'attention'
        : checks.some((c) => c.status === 'pending')
          ? 'pending'
          : 'compatible',
      summary:
        'Conferência automática de texto, marca, domínio, produto e data. Revisão comercial e elementos visuais continuam necessários.',
    };
  } catch (error) {
    return {
      ...result,
      status: 'pending',
      checks: [
        {
          key: 'access',
          status: 'pending',
          message:
            error instanceof Error && error.status === 422
              ? error.message
              : 'Não foi possível ler o material agora. Tente novamente ou revise manualmente.',
        },
      ],
      summary: 'Conteúdo não validado.',
    };
  }
}
