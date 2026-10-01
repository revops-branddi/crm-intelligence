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

/** Extrai somente campos padrão e legíveis da Organização. Campos customizados
 * sem rótulo não entram: enviar hashes ao modelo não cria evidência confiável. */
export function normalizeCompanyProfile(organization) {
  if (!organization) return { available: false, name: '', fields: {} };

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
  };
}

export async function fetchCompanyProfile(orgId, token) {
  if (!orgId) return { available: false, name: '', fields: {} };

  try {
    const res = await fetch(`${PIPEDRIVE_BASE}/organizations/${orgId}?api_token=${token}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { available: false, name: '', fields: {} };
    const body = await res.json();
    return normalizeCompanyProfile(body?.data);
  } catch {
    // A indisponibilidade da organização não pode apagar a análise do card.
    return { available: false, name: '', fields: {} };
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
  return lines.join('\n');
}
