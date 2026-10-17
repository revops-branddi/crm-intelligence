import { HttpError } from './errors.js';
export const idOf = (value) =>
  value && typeof value === 'object' ? (value.id ?? value.value) : value;
export function positiveId(value) {
  const text = String(value ?? '');
  if (!/^[1-9]\d{0,14}$/.test(text))
    throw new HttpError(400, 'Informe um ID numérico válido.', 'invalid_id');
  return text;
}
export async function readBytes(response, maximum) {
  if (Number(response.headers.get('content-length')) > maximum)
    throw new HttpError(
      413,
      'Conteúdo excede o limite configurado; original não baixado.',
      'size_limit',
    );
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maximum)
        throw new HttpError(
          413,
          'Conteúdo excede o limite configurado; original não baixado.',
          'size_limit',
        );
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      504,
      'A transferência do conteúdo não respondeu a tempo; tente retomar.',
      'upstream_timeout',
    );
  }
  return Buffer.concat(chunks);
}
export function pipedriveClient(token, fetcher = fetch) {
  async function request(path, params = {}, binary = false) {
    if (!/^\/api\/v[12]\/[a-zA-Z]+(?:\/[a-zA-Z0-9]+)*$/.test(path))
      throw new HttpError(400, 'Recurso inválido.', 'invalid_resource');
    const url = new URL(path, 'https://api.pipedrive.com');
    for (const [key, value] of Object.entries(params))
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    // Credentials never enter client URLs, stored request metadata, or error messages.
    url.searchParams.set('api_token', token);
    let response;
    try {
      response = await fetcher(url, {
        headers: { Accept: binary ? '*/*' : 'application/json' },
        signal: AbortSignal.timeout(20000),
        redirect: binary ? 'manual' : 'error',
      });
    } catch {
      throw new HttpError(
        504,
        'Pipedrive não respondeu a tempo; a coleta pode ser retomada.',
        'upstream_timeout',
      );
    }
    if (binary && response.status >= 300 && response.status < 400) {
      // Only the Pipedrive download route may provide a signed storage redirect. No token forwarded.
      const location = new URL(response.headers.get('location') || '', url);
      const allowed =
        location.protocol === 'https:' &&
        (location.hostname.endsWith('.pipedrive.com') ||
          location.hostname.endsWith('.amazonaws.com') ||
          location.hostname.endsWith('.cloudfront.net'));
      if (!allowed || location.username || location.password)
        throw new HttpError(
          422,
          'Download externo não permitido; arquivo registrado como lacuna.',
          'unsupported_download',
        );
      try {
        response = await fetcher(location, {
          signal: AbortSignal.timeout(20000),
          redirect: 'error',
        });
      } catch {
        throw new HttpError(
          504,
          'O download do anexo não respondeu a tempo; a coleta pode ser retomada.',
          'upstream_timeout',
        );
      }
    }
    if (!response.ok) {
      const retry = Math.min(60, Math.max(1, Number(response.headers.get('retry-after')) || 5));
      throw new HttpError(
        response.status,
        `Pipedrive retornou ${response.status} para este recurso.`,
        'pipedrive_error',
        response.status === 429 ? retry : null,
      );
    }
    if (binary)
      return {
        buffer: await readBytes(response, 20 * 1024 * 1024),
        mime: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream',
      };
    const bytes = await readBytes(response, 8 * 1024 * 1024);
    let body;
    try {
      body = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new HttpError(502, 'Resposta inválida do Pipedrive.', 'invalid_upstream');
    }
    if (body.success !== true)
      throw new HttpError(502, 'Pipedrive não confirmou a leitura do recurso.', 'invalid_upstream');
    return body;
  }
  return {
    get: (path, params) => request(path, params),
    download: (id) => request(`/api/v1/files/${positiveId(id)}/download`, {}, true),
  };
}
