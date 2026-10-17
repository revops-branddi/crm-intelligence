import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './errors.js';

export function database(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new HttpError(503, 'Backend sem configuração do Supabase.', 'configuration');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authenticate(req, db, env = process.env) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  if (!match) throw new HttpError(401, 'Entre na sua conta para continuar.', 'unauthenticated');
  const { data, error } = await db.auth.getUser(match[1]);
  if (error || !data.user?.email_confirmed_at)
    throw new HttpError(401, 'Sessão inválida ou expirada.', 'unauthenticated');
  const domains = (env.AUTH_ALLOWED_DOMAINS || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const emails = (env.AUTH_ALLOWED_EMAILS || '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const email = (data.user.email || '').toLowerCase();
  if (!domains.length && !emails.length)
    throw new HttpError(
      503,
      'Configure as contas ou os domínios autorizados no servidor.',
      'configuration',
    );
  if (!emails.includes(email) && !domains.includes(email.split('@')[1]))
    throw new HttpError(403, 'Esta conta não tem acesso ao aplicativo.', 'forbidden');
  return data.user;
}
function key(env) {
  const value = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY || '', 'base64');
  if (value.length !== 32)
    throw new HttpError(503, 'Configure a chave de criptografia de credenciais.', 'configuration');
  return value;
}
export function encryptToken(token, ownerId, env = process.env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(env), iv);
  cipher.setAAD(Buffer.from(ownerId));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}
export function decryptToken(value, ownerId, env = process.env) {
  try {
    const [iv, tag, encrypted] = value.split('.').map((s) => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key(env), iv);
    decipher.setAAD(Buffer.from(ownerId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new HttpError(503, 'Reconecte sua conta do Pipedrive.', 'credential_unavailable');
  }
}
export async function limit(db, userId, scope, maximum, seconds) {
  const { data, error } = await db.rpc('crm_consume_limit', {
    p_subject: userId,
    p_scope: scope,
    p_maximum: maximum,
    p_seconds: seconds,
  });
  if (error)
    throw new HttpError(
      503,
      'Controle de uso indisponível. Tente novamente.',
      'storage_unavailable',
    );
  if (!data)
    throw new HttpError(
      429,
      'Limite de uso atingido. Aguarde antes de tentar novamente.',
      'rate_limit',
      seconds,
    );
}
