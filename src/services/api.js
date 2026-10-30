import { supabase } from '../lib/supabase';
export async function apiRequest(action, fields = {}, signal) {
  if (!supabase) throw new Error('Configure a conexão Supabase do aplicativo.');
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
  const response = await fetch('/api/intelligence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...fields }),
    signal,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      'O servidor não retornou uma resposta válida. Verifique a configuração da API.',
    );
  }
  if (!response.ok) {
    const error = new Error(body.error || 'Falha na operação.');
    error.status = response.status;
    error.code = body.code;
    error.retryAfter = body.retryAfter;
    throw error;
  }
  return body;
}
