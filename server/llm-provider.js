import { HttpError } from './errors.js';

export const SUPERPROXY_ORIGIN = 'https://branddi-super-proxy.fly.dev';

// Only server configuration selects the provider. No silent cross-provider fallback.
export function analysisConfiguration(env = process.env) {
  const provider = env.LLM_PROVIDER || (env.SUPERPROXY_API_KEY ? 'superproxy' : 'gemini');
  const model = provider === 'superproxy' ? env.SUPERPROXY_MODEL : env.GEMINI_MODEL;
  const key = provider === 'superproxy' ? env.SUPERPROXY_API_KEY : env.GEMINI_API_KEY;
  const validModel =
    provider === 'superproxy'
      ? /^claude-[a-z0-9.-]+$/.test(model || '')
      : provider === 'gemini' && /^gemini-[a-z0-9.-]+$/.test(model || '');
  return { provider, model: model || null, analysisConfigured: Boolean(validModel && key) };
}

// The provider supports minItems=1, but not string/maximum-array bounds.
// Preserve those limits as descriptions; local Zod validation remains authoritative.
export function superproxySchema(value) {
  if (Array.isArray(value)) return value.map(superproxySchema);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  const constraints = [];
  for (const [key, entry] of Object.entries(value)) {
    if (key === '$schema') continue;
    if (['minLength', 'maxLength', 'maxItems'].includes(key) || (key === 'minItems' && entry > 1)) {
      constraints.push(`${key}: ${entry}`);
      continue;
    }
    result[key] = superproxySchema(entry);
  }
  if (constraints.length)
    result.description = [result.description, ...constraints].filter(Boolean).join('; ');
  return result;
}

export async function superproxyCompletion({ system, input, schema, model, key, fetcher = fetch }) {
  let result;
  const started = Date.now();
  try {
    const response = await fetcher(`${SUPERPROXY_ORIGIN}/v1/messages`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 12288,
        system: `${system}\nDatas e auditoria: referenceAt é a referência da extração; datas de e-mails e notas não são a data da extração. Não declare conflito de horário comparando due_time do CRM com horário local do convite sem normalizar os fusos. 17:00 UTC e 14:00 America/Sao_Paulo podem ser o mesmo instante. Se o fuso de um campo não estiver explícito, declare necessidade de validar o fuso, sem classificar como erro confirmado. Separe recomendações de fatos, inclusive dentro de uma mesma afirmação.\nFormato obrigatório: no máximo 8 seções e 24 afirmações no total. Escreva conclusões compactas, sem repetir informações entre seções. Use somente os trechos de evidência necessários, preferencialmente até 250 caracteres por citação; cada afirmação precisa de 1 a 8 citações. Cada quote deve ter até 1200 caracteres, copiados literalmente. Prefira ao menos 12 caracteres. Para campos curtos, cite a linha completa com o nome do campo e o valor; nunca um valor isolado.`,
        messages: [{ role: 'user', content: JSON.stringify(input) }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      }),
      signal: AbortSignal.timeout(75000),
    });
    if (!response.ok) {
      // Never surface the upstream body: it may echo CRM records or credentials.
      await response.body?.cancel();
      if (response.status === 429) {
        const delay = Number(response.headers?.get('retry-after'));
        throw new HttpError(
          429,
          'O provedor atingiu seu limite. Tente novamente mais tarde.',
          'model_error',
          Number.isFinite(delay) && delay > 0 ? Math.min(Math.ceil(delay), 3600) : 30,
        );
      }
      if ([500, 502, 503, 504, 529].includes(response.status))
        throw new HttpError(
          503,
          'O provedor de IA está temporariamente indisponível. Os dados continuam salvos; tente novamente em instantes.',
          'model_unavailable',
          15,
        );
      throw new HttpError(
        502,
        'O Superproxy recusou a análise. Verifique a configuração no servidor.',
        'model_error',
      );
    }
    result = await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (['TimeoutError', 'AbortError'].includes(error?.name))
      throw new HttpError(
        504,
        'A análise excedeu o tempo disponível. Os dados brutos estão salvos; tente novamente.',
        'model_timeout',
      );
    throw new HttpError(
      502,
      'Não foi possível concluir a resposta do Superproxy. Os dados continuam salvos.',
      'model_error',
    );
  }
  if (result.stop_reason !== 'end_turn')
    throw new HttpError(
      502,
      'A IA não concluiu a resposta (limite, bloqueio ou interrupção). Nenhuma análise foi salva.',
      'incomplete_answer',
    );
  return {
    text: (result.content || [])
      .filter((p) => p.type === 'text')
      .map((p) => p.text || '')
      .join(''),
    model: result.model || model,
    usage: { ...(result.usage || {}), provider: 'superproxy' },
    elapsed_ms: Date.now() - started,
  };
}
