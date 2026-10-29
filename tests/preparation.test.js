import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './memory-db.js';
import { preparationAction, groupNotice, synchronizeTasks } from '../server/preparation.js';
import { validateMaterial, inspectMaterial, scopeDigest } from '../server/material-validation.js';
import { materialReadUrl, publicAddress, readMaterial } from '../server/material-reader.js';
import { HttpError } from '../server/errors.js';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@branddi.test' };
const snapshot = {
  id: '22222222-2222-4222-8222-222222222222',
  user_id: user.id,
  company_id: 'co',
  deal_id: '7',
  title: 'Lume | Brand Bidding',
  started_at: '2026-10-29T12:00:00Z',
};
const sources = [
  {
    id: 'deal:7',
    kind: 'deal',
    recordId: '7',
    text: 'Título: Lume | Brand Bidding\nOrganização: 250\nPessoa: 123\ncustom_fields.Relatório BB: https://report.branddi.com/report/lume\ncustom_fields.Link PPT: https://docs.google.com/presentation/d/synthetic/edit',
  },
  {
    id: 'org:250',
    kind: 'organization',
    recordId: '250',
    text: 'Nome: Lume\nSite: lume.test\ncustom_fields.Grupo Empresarial: não informado',
  },
  {
    id: 'note:1',
    kind: 'notes',
    recordId: '1',
    text: 'deal_id: 7\nFaz parte de grupo: Pertence ao Grupo Arco.',
  },
];
const scope = {
  kind: 'brand',
  brands: ['Lume'],
  domains: ['lume.test'],
  product: 'Brand Bidding',
  maxAgeDays: 30,
};
function context() {
  return {
    db: memoryDb(),
    user,
    snapshot,
    sources,
    currentDeal: { id: 7, owner_id: 9 },
    client: {
      get: async () => ({
        data: [
          { id: 9, name: 'SDR Teste', active_flag: true },
          { id: 10, name: 'Closer Teste', active_flag: true },
          { id: 11, name: 'Inativo', active_flag: false },
        ],
      }),
    },
  };
}
const call = (ctx, action, fields = {}) => preparationAction({ action, ...fields }, ctx);
test('group notice is explicit, excludes negative membership and keeps uncertain variants', () => {
  assert.equal(
    groupNotice({
      facts: [{ field: 'group', text: 'Grupo empresarial: Não faz parte de grupo', citations: [] }],
    }),
    null,
  );
  const group = groupNotice({
    facts: [
      {
        field: 'group',
        text: 'Grupo empresarial: Pertence ao Grupo Arco.',
        origin: 'note',
        citations: [],
      },
    ],
  });
  assert.equal(group.label, 'Grupo Arco');
  assert.equal(group.registrationPending, true);
});
test('preparation persists assignment, scope and individual approvals across reads without CRM writes', async () => {
  const ctx = context();
  let result = await call(ctx, 'preparation');
  assert.equal(result.group.label, 'Grupo Arco');
  assert.equal(result.assignees.length, 2);
  assert.equal(result.tasks.find((t) => t.id === 'group-registration').assignee.name, 'SDR Teste');
  result = await call(ctx, 'saveScope', { revision: result.revision, scope, assigneeId: '9' });
  assert.equal(result.scope.kind, 'brand');
  assert.equal(result.tasks.find((t) => t.id === 'scope').status, 'resolved');
  const revision = result.revision;
  result = await call(ctx, 'savePreparationTask', {
    revision,
    taskId: 'group-registration',
    assigneeId: '10',
    status: 'in_progress',
    note: 'Conferido com cadastro e nota da marca.',
    dueDate: '2026-11-01',
    approveHelpdesk: true,
  });
  const task = result.tasks.find((t) => t.id === 'group-registration');
  assert.equal(task.assignee.name, 'Closer Teste');
  assert.equal(task.approval.by, user.email);
  assert.ok(task.draft.description.includes('Grupo Arco'));
  assert.equal(result.tasks.filter((t) => t.approval).length, 1);
  const reloaded = await call(ctx, 'preparation');
  assert.deepEqual(
    reloaded.tasks.find((t) => t.id === task.id),
    task,
  );
  assert.equal(reloaded.revision, result.revision);
  assert.equal(reloaded.history.length, 2);
  await assert.rejects(
    () =>
      call(ctx, 'savePreparationTask', {
        revision,
        taskId: task.id,
        assigneeId: '9',
        status: 'resolved',
        note: 'revisão anterior',
        dueDate: '',
      }),
    (e) => e.code === 'workflow_conflict',
  );
});
test('rejects unknown/inactive assignees, unconfirmed completion and checklist-to-ticket promotion', async () => {
  const ctx = context();
  const result = await call(ctx, 'preparation');
  for (const assigneeId of ['11', '999'])
    await assert.rejects(
      () => call(ctx, 'saveScope', { revision: result.revision, scope, assigneeId }),
      /responsável ativo/,
    );
  await assert.rejects(
    () =>
      call(ctx, 'savePreparationTask', {
        revision: result.revision,
        taskId: 'contact-scope',
        assigneeId: '9',
        status: 'resolved',
        note: '',
        dueDate: '',
      }),
    /como a pendência/,
  );
  await assert.rejects(
    () =>
      call(ctx, 'savePreparationTask', {
        revision: result.revision,
        taskId: 'contact-scope',
        assigneeId: '9',
        status: 'open',
        note: 'Ainda não identificado',
        dueDate: '',
        approveHelpdesk: true,
      }),
    /Confirme uma ocorrência/,
  );
  ctx.validate = async (_material, reference) => ({
    status: 'compatible',
    scopeHash: scopeDigest(reference),
    checkedAt: new Date().toISOString(),
    checks: [],
  });
  const provisional = await call(ctx, 'validateMaterial', { materialKey: result.materials[0].key });
  assert.equal(provisional.materials[0].validation.status, 'pending');
  assert.equal(provisional.materials[0].validation.scopeUnconfirmed, true);
  assert.equal(provisional.scope, null);
});
test('changed scope invalidates checks and reopens affected tasks, preserving assignment and audit', async () => {
  const ctx = context();
  let result = await call(ctx, 'preparation');
  result = await call(ctx, 'saveScope', { revision: result.revision, scope, assigneeId: '9' });
  ctx.validate = async (material, scope) => ({
    status: 'compatible',
    url: material.url,
    checkedAt: new Date().toISOString(),
    scopeHash: scopeDigest(scope),
    contentHash: 'abc',
    checks: [{ key: 'brand', status: 'pass', message: 'Lume' }],
  });
  result = await call(ctx, 'validateMaterial', { materialKey: result.materials[0].key });
  const key = result.materials[0].key;
  result = await call(ctx, 'savePreparationTask', {
    revision: result.revision,
    taskId: key,
    assigneeId: '10',
    status: 'resolved',
    note: 'Material revisado com o responsável.',
    dueDate: '',
    approveHelpdesk: false,
  });
  result = await call(ctx, 'saveScope', {
    revision: result.revision,
    scope: { ...scope, kind: 'group', brands: ['Lume', 'Nuvem'] },
    assigneeId: '9',
  });
  assert.equal(result.materials[0].validation.stale, true);
  const task = result.tasks.find((t) => t.id === key);
  assert.equal(task.status, 'open');
  assert.equal(task.assignee.id, '10');
  assert.equal(task.changedEvidence, true);
  assert.equal(result.history.length, 4);
});
test('checks cannot overwrite a newer scope saved during material download', async () => {
  const ctx = context();
  let result = await call(ctx, 'preparation');
  result = await call(ctx, 'saveScope', { revision: result.revision, scope, assigneeId: '9' });
  ctx.validate = async (_material, before) => {
    await call(ctx, 'saveScope', {
      revision: result.revision,
      scope: { ...scope, product: 'Golpes Digitais' },
      assigneeId: '9',
    });
    return { scopeHash: scopeDigest(before), checks: [] };
  };
  await assert.rejects(
    () => call(ctx, 'validateMaterial', { materialKey: result.materials[0].key }),
    (e) => e.code === 'workflow_conflict',
  );
  assert.equal((await call(ctx, 'preparation')).scope.product, 'Golpes Digitais');
});

test('storage failure preserves the previous task and never reports approval as saved', async () => {
  const ctx = context();
  const result = await call(ctx, 'preparation');
  ctx.db.fail('crm_preparation_workflows', 'update');
  await assert.rejects(
    () =>
      call(ctx, 'savePreparationTask', {
        revision: result.revision,
        taskId: 'group-registration',
        assigneeId: '10',
        status: 'in_progress',
        note: 'Conferido nas fontes disponíveis.',
        dueDate: '',
        approveHelpdesk: true,
      }),
    (e) => e.status === 503,
  );
  const reloaded = await call(ctx, 'preparation');
  assert.equal(reloaded.tasks.find((task) => task.id === 'group-registration').approval, null);
  assert.equal(reloaded.history.length, 0);
});
test('new extraction retains pending decisions but historical snapshots cannot overwrite newer workflow', async () => {
  const ctx = context();
  let result = await call(ctx, 'preparation');
  await call(ctx, 'savePreparationTask', {
    revision: result.revision,
    taskId: 'contact-scope',
    assigneeId: '10',
    status: 'in_progress',
    note: 'Aguardando confirmação do contato.',
    dueDate: '',
    approveHelpdesk: false,
  });
  const newer = {
    ...ctx,
    snapshot: {
      ...snapshot,
      id: '33333333-3333-4333-8333-333333333333',
      started_at: '2026-10-30T12:00:00Z',
    },
  };
  const next = await call(newer, 'preparation');
  assert.equal(next.tasks.find((t) => t.id === 'contact-scope').assignee.id, '10');
  assert.equal((await call(ctx, 'preparation')).readOnly, true);
  await assert.rejects(
    () => call(ctx, 'saveScope', { revision: next.revision, scope, assigneeId: '9' }),
    /extração mais recente/,
  );
});
test('changed evidence removes approval and draft, while unrelated tasks keep decisions', () => {
  const old = {
    a: {
      id: 'a',
      fingerprint: '1',
      active: true,
      assignee: { id: '9' },
      status: 'dismissed',
      approval: { by: 'x' },
      draft: { title: 'old' },
    },
  };
  const tasks = synchronizeTasks(old, [{ id: 'a', fingerprint: '2' }]);
  assert.equal(tasks.a.status, 'open');
  assert.equal(tasks.a.approval, null);
  assert.equal(tasks.a.draft, null);
  assert.equal(tasks.a.assignee.id, '9');
});

test('two distinct issues citing the same record remain independently reviewable', async () => {
  const ctx = context();
  ctx.db.tables.crm_answers = [
    {
      id: 'answer',
      snapshot_id: snapshot.id,
      user_id: user.id,
      mode: 'overview',
      answer: {
        sections: [
          {
            title: 'Dados divergentes',
            claims: [
              {
                text: 'O cargo diverge do cadastro.',
                kind: 'fact',
                citations: [{ sourceId: 'note:1', quote: 'Registro comercial completo.' }],
              },
              {
                text: 'O responsável diverge do cadastro.',
                kind: 'fact',
                citations: [{ sourceId: 'note:1', quote: 'Registro comercial completo.' }],
              },
            ],
          },
        ],
        gaps: [],
        suggestedQuestions: [],
      },
    },
  ];
  const result = await call(ctx, 'preparation');
  const issues = result.tasks.filter((task) => task.id.startsWith('issue:'));
  assert.equal(issues.length, 2);
  assert.notEqual(issues[0].id, issues[1].id);
});
test('material checks compare actual text and dates, never mere URLs or incidental competitor mentions', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const document = {
    title: 'Lume — Brand Bidding',
    text: 'Lume — relatório Brand Bidding. Domínio: lume.test. Gerado em: 28/10/2026. Análise comercial e detalhes dos anúncios encontrados.',
  };
  assert.ok(inspectMaterial(document, scope, now).every((c) => c.status === 'pass'));
  assert.equal(
    inspectMaterial(
      { ...document, text: document.text.replace('28/10/2026', '23 de outubro de 2026') },
      scope,
      now,
    ).find((c) => c.key === 'date').status,
    'pass',
  );
  assert.equal(
    inspectMaterial(
      { ...document, text: document.text.replace('28/10/2026', '01/09/2026') },
      scope,
      now,
    ).find((c) => c.key === 'date').status,
    'attention',
  );
  assert.equal(
    inspectMaterial(
      { ...document, text: document.text.replace('lume.test', 'outra.test') },
      scope,
      now,
    ).find((c) => c.key === 'domain').status,
    'attention',
  );
  assert.equal(
    inspectMaterial(
      { ...document, title: 'Outra marca', text: 'Outra marca. '.repeat(150) + document.text },
      scope,
      now,
    ).find((c) => c.key === 'brand').status,
    'pending',
  );
  assert.equal(
    inspectMaterial(
      { ...document, text: document.text.replace('Gerado em: 28/10/2026.', '') },
      scope,
      now,
    ).find((c) => c.key === 'date').status,
    'pending',
  );
  assert.equal(
    inspectMaterial(document, { ...scope, brands: ['Lume', 'Nuvem'] }, now).find(
      (c) => c.key === 'brand',
    ).status,
    'attention',
  );
  assert.equal(inspectMaterial({ text: 'Login' }, scope, now)[0].status, 'pending');
});
test('restricted and failed material reads stay pending, and do not preserve credentials/errors', async () => {
  const material = { url: 'https://docs.google.com/presentation/d/x/edit', title: 'PPT' };
  const result = await validateMaterial(material, scope, {
    read: async () => {
      throw new Error('SECRET');
    },
  });
  assert.equal(result.status, 'pending');
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  const restricted = await validateMaterial(material, scope, {
    read: async () => {
      throw new HttpError(422, 'Acesso restrito', 'restricted');
    },
  });
  assert.match(restricted.checks[0].message, /restrito/);
});
test('material reader restricts hosts and public addresses, strips tracking and exports Google text', () => {
  for (const url of [
    'http://report.branddi.com/report/x',
    'https://localhost/x',
    'https://report.branddi.com.evil.test/report/x',
    'https://user:secret@report.branddi.com/report/x',
    'https://report.branddi.com/api/admin/delete',
    'https://docs.google.com/other/path',
  ])
    assert.throws(() => materialReadUrl(url));
  assert.equal(
    materialReadUrl('https://report.branddi.com/report/lume?email=x#section').href,
    'https://report.branddi.com/report/lume',
  );
  assert.equal(
    materialReadUrl('https://docs.google.com/presentation/d/ABC/edit#slide=1').href,
    'https://docs.google.com/presentation/d/ABC/export/txt',
  );
  for (const ip of [
    '127.0.0.1',
    '169.254.169.254',
    '10.0.0.1',
    '192.168.1.1',
    '100.64.1.1',
    '::1',
    '::ffff:127.0.0.1',
  ])
    assert.equal(publicAddress(ip), false);
  assert.equal(publicAddress('93.184.216.34'), true);
});
function mockRequest(responses, seen) {
  return (url, options, callback) => {
    seen.push({ url: url.href, options });
    const request = new EventEmitter();
    request.end = () => {
      const data = responses.shift();
      const response = Readable.from([Buffer.from(data.body || '')]);
      Object.assign(response, {
        statusCode: data.status || 200,
        headers: data.headers || { 'content-type': 'text/plain' },
      });
      callback(response);
    };
    return request;
  };
}
test('reader checks redirects, pins DNS, never forwards authorization and rejects oversized responses', async () => {
  const seen = [],
    resolve = async () => [{ address: '93.184.216.34', family: 4 }];
  const request = mockRequest(
    [{ status: 302, headers: { location: 'https://127.0.0.1/secret' } }],
    seen,
  );
  await assert.rejects(
    () => readMaterial('https://report.branddi.com/report/lume', { resolve, request }),
    /Redirecionamento/,
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].options.headers.Authorization, undefined);
  seen[0].options.lookup('report.branddi.com', {}, (_error, address) =>
    assert.equal(address, '93.184.216.34'),
  );
  await assert.rejects(
    () =>
      readMaterial('https://report.branddi.com/report/lume', {
        resolve: async () => [{ address: '10.0.0.1' }],
        request,
      }),
    /segura/,
  );
  await assert.rejects(
    () =>
      readMaterial('https://report.branddi.com/report/lume', {
        resolve,
        request: mockRequest([{ body: 'x'.repeat(5 * 1024 * 1024 + 1) }], []),
      }),
    /5 MB/,
  );
  await assert.rejects(
    () =>
      readMaterial('https://docs.google.com/presentation/d/test/edit', {
        resolve,
        request: mockRequest(
          [{ status: 302, headers: { location: 'https://accounts.google.com/login' } }],
          [],
        ),
      }),
    /restrito/,
  );
});
