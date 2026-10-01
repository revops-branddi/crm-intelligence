const PIPEDRIVE_BASE = '/api/pipedrive';

function text(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && typeof value.value === 'string') return value.value.trim();
  return '';
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

function customFieldValue(value, field) {
  if (value === null || value === undefined || value === '') return '';

  const options = new Map((field?.options || []).map(option => [String(option.id), option.label]));
  if (options.size) {
    const values = Array.isArray(value) ? value : String(value).split(',');
    const translated = values
      .map(item => options.get(String(item).trim()))
      .filter(Boolean);
    if (translated.length) return translated.join(', ');
  }

  return text(value);
}

function customFields(organization, definitions = []) {
  return definitions
    .filter(field => field?.key && field?.name && organization?.[field.key] !== undefined)
    .map(field => ({
      label: String(field.name).trim(),
      value: customFieldValue(organization[field.key], field),
    }))
    .filter(field => field.label && field.value)
    .slice(0, 30);
}

/** Extrai somente campos padrão e legíveis da Organização. Campos customizados
 * sem rótulo não entram: enviar hashes ao modelo não cria evidência confiável. */
export function normalizeCompanyProfile(organization, fieldDefinitions = []) {
  if (!organization) return { available: false, name: '', fields: {}, customFields: [] };

  const fields = {
    site: text(organization.website),
    setor: text(organization.industry),
    endereco: text(organization.address),
    cidade: text(organization.city),
    estado: text(organization.state),
    pais: text(organization.country),
    porte: text(organization.employee_count),
    telefone: text(organization.phone),
    categorias: list(organization.label),
  };

  return {
    available: true,
    name: text(organization.name),
    fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))),
    customFields: customFields(organization, fieldDefinitions),
  };
}

export async function fetchCompanyProfile(orgId, token) {
  if (!orgId) return { available: false, name: '', fields: {}, customFields: [] };

  try {
    const headers = { Accept: 'application/json' };
    const [organizationRes, fieldsRes] = await Promise.all([
      fetch(`${PIPEDRIVE_BASE}/organizations/${orgId}?api_token=${token}`, { method: 'GET', headers }),
      fetch(`${PIPEDRIVE_BASE}/organizationFields?limit=500&api_token=${token}`, { method: 'GET', headers }),
    ]);
    if (!organizationRes.ok) return { available: false, name: '', fields: {}, customFields: [] };

    const organizationBody = await organizationRes.json();
    const fieldsBody = fieldsRes.ok ? await fieldsRes.json() : { data: [] };
    return normalizeCompanyProfile(organizationBody?.data, fieldsBody?.data || []);
  } catch {
    // A indisponibilidade da organização não pode apagar a análise do card.
    return { available: false, name: '', fields: {}, customFields: [] };
  }
}

export function companyProfileToPrompt(profile) {
  if (!profile?.available) {
    return 'Organização não vinculada ao deal ou indisponível no CRM. Declare esta lacuna; não deduza dados externos.';
  }

  const lines = [`Nome: ${profile.name || 'não informado no CRM'}`];
  for (const [label, value] of Object.entries(profile.fields || {})) {
    const printable = Array.isArray(value) ? value.join(', ') : value;
    lines.push(`${label}: ${printable}`);
  }
  for (const field of profile.customFields || []) {
    lines.push(`${field.label}: ${field.value}`);
  }
  return lines.join('\n');
}
