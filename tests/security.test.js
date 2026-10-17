import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, encryptToken, decryptToken } from '../server/security.js';
import { createHandler } from '../server/api-handler.js';
import { pipedriveClient } from '../server/pipedrive.js';
const env = {
  CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  AUTH_ALLOWED_DOMAINS: 'branddi.test',
};
const db = {
  auth: {
    getUser: async () => ({
      data: { user: { id: 'owner', email: 'user@branddi.test', email_confirmed_at: '2026-01-01' } },
    }),
  },
};
test('rejects missing bearer, unverified accounts and unapproved domains', async () => {
  await assert.rejects(
    () => authenticate({ headers: {} }, db, env),
    (error) => error.status === 401,
  );
  assert.equal(
    (await authenticate({ headers: { authorization: 'Bearer session' } }, db, env)).id,
    'owner',
  );
  await assert.rejects(
    () =>
      authenticate({ headers: { authorization: 'Bearer session' } }, db, {
        AUTH_ALLOWED_DOMAINS: 'other.test',
      }),
    (error) => error.status === 403,
  );
  await assert.rejects(
    () => authenticate({ headers: { authorization: 'Bearer session' } }, db, {}),
    (error) => error.status === 503,
  );
});
test('encrypted credentials are bound to owner and reject tampering', () => {
  const encrypted = encryptToken('secret-token', 'owner', env);
  assert.ok(!encrypted.includes('secret-token'));
  assert.equal(decryptToken(encrypted, 'owner', env), 'secret-token');
  assert.throws(() => decryptToken(encrypted, 'another-owner', env));
  assert.throws(() => decryptToken(encrypted.slice(0, -8) + 'deadbeef', 'owner', env));
});
test('unauthenticated API never invokes actions or provider', async () => {
  let called = false;
  const response = {
    setHeader() {},
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
  await createHandler({
    getDatabase: () => db,
    action: () => {
      called = true;
    },
    env,
  })({ method: 'POST', headers: {}, body: { action: 'answer' } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(called, false);
});
test('client-supplied model is never forwarded in validated input', async () => {
  let parsed;
  const response = {
    setHeader() {},
    status() {
      return this;
    },
    json() {},
  };
  await createHandler({
    getDatabase: () => ({ rpc: async () => ({ data: true }) }),
    auth: async () => ({ id: 'u' }),
    action: async (input) => {
      parsed = input;
      return {};
    },
    env,
  })(
    { method: 'POST', headers: {}, body: { action: 'status', model: 'attacker-model' } },
    response,
  );
  assert.deepEqual(parsed, { action: 'status' });
});
test('Pipedrive errors never include token and external paths are rejected', async () => {
  const client = pipedriveClient(
    'SENSITIVE_TOKEN',
    async () => new Response('SENSITIVE_TOKEN', { status: 403 }),
  );
  await assert.rejects(
    () => client.get('/api/v2/deals/7'),
    (error) => !error.message.includes('SENSITIVE_TOKEN') && error.status === 403,
  );
  await assert.rejects(
    () => client.get('https://attacker.test'),
    (error) => error.status === 400,
  );
});
test('download rejects untrusted redirect hosts without forwarding requests', async () => {
  let calls = 0;
  const client = pipedriveClient('SENSITIVE_TOKEN', async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  });
  await assert.rejects(
    () => client.download(7),
    (error) => error.code === 'unsupported_download',
  );
  assert.equal(calls, 1);
});
