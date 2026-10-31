#!/usr/bin/env node
// Somente leitura. Nunca abre auth.json, imprime tokens ou inicia login/modelo.
import { spawn, execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TIMEOUT = 10_000;
const PESSOAS = new Map(Object.entries({
  'dtodres@branddi.com': 'Diego Todres',
  'sergio.munoz@branddi.com': 'Sergio Munoz',
  'victor.hugo@branddi.com': 'Victor Petroni',
  'jessica.naves@branddi.com': 'Jessica Naves',
  'railanne.araujo@branddi.com': 'Railanne Araujo',
  'livia.silva@branddi.com': 'Livia Silva',
  'lucas.chaves@branddi.com': 'Lucas Chaves',
  'luiz.claudio@branddi.com': 'Luiz Claudio',
}));

export function identificarConta(account) {
  if (account?.type !== 'chatgpt' || typeof account.email !== 'string') {
    return { status: 'perguntar', motivo: 'conta_individual_indisponivel' };
  }
  const email = account.email.trim().toLowerCase();
  const nome = PESSOAS.get(email);
  if (!nome) return { status: 'perguntar', motivo: 'email_sem_correspondencia_no_time' };
  return { status: 'identificado', nome, email, origem: 'conta_codex' };
}

export function lerConta({ spawnProcess = spawn, timeoutMs = TIMEOUT, platform = process.platform } = {}) {
  return new Promise((resolve, reject) => {
    // O shell do Windows recebe somente esta constante; nenhum dado da conta/conversa.
    const child = platform === 'win32'
      ? spawnProcess('cmd.exe', ['/d', '/s', '/c', 'codex app-server --stdio'], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      })
      : spawnProcess('codex', ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let finished = false;
    let buffer = '';
    const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
    const finish = (error, account) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.stdin.end();
      const stop = setTimeout(() => {
        if (child.exitCode !== null && child.exitCode !== undefined) return;
        if (platform === 'win32' && child.pid) {
          execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
        } else child.kill();
      }, 500);
      stop.unref();
      if (error) reject(new Error(error)); else resolve(account);
    };
    const timer = setTimeout(() => finish('consulta_indisponivel'), timeoutMs);
    child.on('error', () => finish('consulta_indisponivel'));
    child.on('exit', () => { if (!finished) finish('consulta_indisponivel'); });
    child.stdin.on('error', () => finish('consulta_indisponivel'));
    // Drena, mas nunca publica logs que possam conter credenciais ou dados do ambiente.
    child.stderr.on('data', () => {});
    child.stdout.on('data', (chunk) => {
      if (finished) return;
      buffer += chunk.toString('utf8');
      if (buffer.length > 65_536) return finish('resposta_invalida');
      let newline;
      while (!finished && (newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          if (message.error) return finish('consulta_indisponivel');
          send({ method: 'initialized', params: {} });
          send({ id: 2, method: 'account/read', params: { refreshToken: false } });
        } else if (message.id === 2) {
          if (message.error) return finish('consulta_indisponivel');
          finish(null, message.result?.account ?? null);
        }
      }
    });
    send({ id: 1, method: 'initialize', params: {
      clientInfo: { name: 'branddi_pr_autoria', title: 'Branddi PR autoria', version: '1.0.0' },
    } });
  });
}

export async function main() {
  try {
    const result = identificarConta(await lerConta());
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.status === 'identificado' ? 0 : 2;
  } catch {
    process.stdout.write(`${JSON.stringify({ status: 'perguntar', motivo: 'consulta_indisponivel' })}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
