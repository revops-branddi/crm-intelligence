import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { convert } from 'html-to-text';
import { extractAttachment } from './attachments.js';
import { HttpError } from './errors.js';

const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
])
  denied.addSubnet(address, prefix);
export const publicAddress = (ip) => isIP(ip) === 4 && !denied.check(ip);
const unavailable = (message, code = 'material_unavailable') => new HttpError(422, message, code);
async function boundedLookup(resolve, hostname, signal) {
  signal.throwIfAborted();
  return new Promise((res, rej) => {
    const abort = () => rej(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => resolve(hostname, { all: true, family: 4 }))
      .then(res, rej)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

export function materialReadUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw unavailable('Link fora dos endereços permitidos para leitura.', 'unsupported_host');
  if (url.hostname === 'report.branddi.com' && /^\/report\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) {
    url.search = '';
    url.hash = '';
    return url;
  }
  const document = url.pathname.match(/^\/(presentation|document)\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (url.hostname === 'docs.google.com' && document)
    return new URL(
      `https://docs.google.com/${document[1]}/d/${document[2]}/export${document[1] === 'presentation' ? '/txt' : '?format=txt'}`,
    );
  throw unavailable('Este endereço requer revisão manual do material.', 'unsupported_host');
}

// No cookies, CRM credentials or browser session are forwarded. Resolve and pin
// a public address on EVERY redirect to prevent DNS rebinding and private SSRF.
export async function readMaterial(value, { resolve = lookup, request = https.request } = {}) {
  const initial = materialReadUrl(value);
  let url = initial;
  const signal = AbortSignal.timeout(18000);
  for (let hop = 0; hop < 4; hop++) {
    const addresses = await boundedLookup(resolve, url.hostname, signal);
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
      throw unavailable('Destino indisponível para leitura segura.', 'unsupported_host');
    const response = await new Promise((res, rej) => {
      const req = request(
        url,
        {
          method: 'GET',
          agent: false,
          signal,
          headers: {
            Accept: 'text/plain,text/html,application/pdf',
            'User-Agent': 'CRM-Intelligence-Validation/1.0',
          },
          lookup: (_host, options, cb) =>
            options.all
              ? cb(null, [{ address: addresses[0].address, family: 4 }])
              : cb(null, addresses[0].address, 4),
        },
        res,
      );
      req.on('error', rej);
      req.end();
    });
    if (response.statusCode >= 300 && response.statusCode < 400) {
      response.destroy();
      const next = new URL(response.headers.location || '', url);
      if (next.hostname === 'accounts.google.com')
        throw unavailable(
          'Material com acesso restrito. Abra com sua conta e revise o conteúdo.',
          'restricted',
        );
      const googleExport =
        initial.hostname === 'docs.google.com' &&
        (next.hostname === 'docs.google.com' || next.hostname.endsWith('.googleusercontent.com'));
      const report =
        initial.hostname === 'report.branddi.com' &&
        next.hostname === initial.hostname &&
        /^\/report\/[a-zA-Z0-9_-]+\/?$/.test(next.pathname);
      if (
        !(googleExport || report) ||
        next.protocol !== 'https:' ||
        next.username ||
        next.password ||
        next.port
      )
        throw unavailable('Redirecionamento não permitido; revise o link.', 'unsupported_redirect');
      url = next;
      continue;
    }
    if (response.statusCode !== 200) {
      response.destroy();
      throw unavailable(
        [401, 403].includes(response.statusCode)
          ? 'Material com acesso restrito. Revisão manual necessária.'
          : `Material indisponível (HTTP ${response.statusCode}). Confira o link.`,
        [401, 403].includes(response.statusCode) ? 'restricted' : 'http_error',
      );
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response) {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        response.destroy();
        throw unavailable('Material excede 5 MB; revisão manual necessária.', 'size_limit');
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const mime = String(response.headers['content-type'] || '').split(';')[0];
    const raw = buffer.toString('utf8');
    if (mime.includes('html')) {
      const title = convert(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '', {
        wordwrap: false,
      });
      if (
        /sign in|fazer login|access denied|solicitar acesso|you need access/i.test(title) ||
        /<input[^>]*type=["']password/i.test(raw)
      )
        throw unavailable('Material com acesso restrito. Revisão manual necessária.', 'restricted');
      const text = convert(raw, {
        wordwrap: false,
        selectors: [{ selector: 'a', options: { ignoreHref: true } }],
      });
      return { text, title, url: url.href, mime };
    }
    const result = await extractAttachment(
      buffer,
      mime,
      mime === 'application/pdf' ? 'material.pdf' : 'material.txt',
    );
    if (!/^text\//.test(mime) && mime !== 'application/pdf')
      throw unavailable(
        'Formato não suportado para validação; revisão manual necessária.',
        'unsupported_format',
      );
    return {
      text: result.text,
      title: result.text.split('\n').find((line) => line.trim()) || '',
      url: url.href,
      mime,
    };
  }
  throw unavailable('O material redireciona em excesso. Confira o link.', 'redirect_limit');
}
