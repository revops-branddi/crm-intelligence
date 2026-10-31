// Catalog used by SERP Monitor: monitoring defaults + Brazilian capitals.
// Source: revops-branddi/serp-monitor src/lib/constants.ts (2d91c87), 2026-10-30.
export const monitoringCities = [
  'São Paulo,Brazil',
  'Campinas,Brazil',
  'Guarulhos,Brazil',
  'São Bernardo do Campo,Brazil',
  'Santo André,Brazil',
  'Osasco,Brazil',
  'Sorocaba,Brazil',
  'Ribeirão Preto,Brazil',
  'São José dos Campos,Brazil',
  'Santos,Brazil',
  'Rio de Janeiro,Brazil',
  'Niterói,Brazil',
  'Belo Horizonte,Brazil',
  'Uberlândia,Brazil',
  'Vitória,Brazil',
  'Curitiba,Brazil',
  'Porto Alegre,Brazil',
  'Florianópolis,Brazil',
  'Joinville,Brazil',
  'Salvador,Brazil',
  'Fortaleza,Brazil',
  'Recife,Brazil',
  'Maceió,Brazil',
  'São Luís,Brazil',
  'Brasília,Brazil',
  'Goiânia,Brazil',
  'Manaus,Brazil',
  'Rio Branco,Brazil',
  'Macapá,Brazil',
  'Cuiabá,Brazil',
  'Campo Grande,Brazil',
  'Belém,Brazil',
  'João Pessoa,Brazil',
  'Teresina,Brazil',
  'Natal,Brazil',
  'Porto Velho,Brazil',
  'Boa Vista,Brazil',
  'Aracaju,Brazil',
  'Palmas,Brazil',
];

export const cityLabel = (city) => city.replace(/,\s*Brazil$/i, '').trim();
export const cityKey = (city) =>
  cityLabel(city)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function cityOptions(extra = []) {
  const unique = new Map();
  for (const value of [...monitoringCities, ...extra]) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const key = cityKey(value);
    if (!unique.has(key)) unique.set(key, { value, label: cityLabel(value), key });
  }
  return [...unique.values()];
}
