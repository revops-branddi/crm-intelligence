import { projectFixture } from './project-fixture.js';
import { test, expect } from '@playwright/test';
import { preparationAction } from '../server/preparation.js';
import { memoryDb } from '../tests/memory-db.js';
import { validateMaterial } from '../server/material-validation.js';
import { buildSources } from '../server/sources.js';
const id = '22222222-2222-4222-8222-222222222222';
const source = {
  id: 'notes:aaaaaaaaaaaa:1:0',
  kind: 'notes',
  recordId: '1',
  taskKey: 'a'.repeat(64),
  part: 0,
  title: 'Compromisso do cliente',
  text: 'O cliente confirmou a reunião de terça-feira.',
  date: '2026-10-16',
};
const companySource = {
  ...source,
  id: 'notes:aaaaaaaaaaaa:2:0',
  title: 'Contexto da empresa',
  text: 'Faz parte de grupo: Pertence ao Grupo Arco.',
};
const companyProfile = {
  organizationId: '250',
  facts: [
    {
      key: 'company:group',
      field: 'group',
      category: 'company',
      kind: 'fact',
      origin: 'note',
      attribution: 'Nota interna do card · 16/10/2026',
      text: 'Grupo empresarial: Pertence ao Grupo Arco.',
      citations: [{ sourceId: companySource.id, quote: companySource.text }],
    },
    {
      key: 'company:identity',
      field: 'identity',
      category: 'company',
      kind: 'fact',
      origin: 'organization',
      attribution: 'Cadastro da organização #250',
      text: 'Empresa: Lume · Site: lume.example.test · Segmento: Varejo',
      citations: [{ sourceId: 'organization:250:0', quote: 'Nome: Lume' }],
    },
  ],
  warnings: ['O grupo não está preenchido no cadastro da organização.'],
};
const snapshot = {
  id,
  deal_id: '7',
  title: 'Conta de demonstração',
  status: 'complete',
  started_at: '2026-10-17T12:00:00Z',
  completed_at: '2026-10-17T12:01:00Z',
  completed_tasks: 20,
  remainingTasks: 0,
  gaps: [{ resource: 'attachment', message: 'Imagem preservada; requer leitura manual.' }],
  metrics: {
    daysOpen: 30,
    daysInactive: 1,
    totalActions: 5,
    pendingActivities: 2,
    referenceAt: '2026-10-17T12:01:00Z',
    contactDefinition: 'Contato registrado não comprova resposta do lead.',
  },
};
function answer(mode, question = '') {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    snapshot_id: id,
    mode,
    question,
    model: 'synthetic-model',
    created_at: '2026-10-17T12:02:00Z',
    context_manifest: { selectedChunks: 3, totalChunks: 10 },
    answer: {
      sections: [
        {
          title: 'Próximo compromisso',
          claims: [
            {
              text: 'A reunião foi confirmada pelo cliente.',
              kind: 'fact',
              citations: [
                { sourceId: source.id, quote: 'O cliente confirmou a reunião de terça-feira.' },
              ],
            },
          ],
        },
      ],
      gaps: ['Contexto selecionado: 3 de 10 trechos.'],
      suggestedQuestions: ['Quem participará da reunião?'],
    },
  };
}
async function fixture(
  page,
  {
    connected = true,
    failAnalysis = false,
    cached = false,
    coreFirst = false,
    rich = false,
    company = false,
    savedAnswers,
    spreadsheetBatches = 0,
    operational = false,
    projectScopeConfirmed = true,
    multipleCampaigns = false,
    queueDetail,
    projectOptions = {},
  } = {},
) {
  const calls = [];
  const project = projectFixture({
    scopeConfirmed: projectScopeConfirmed,
    multipleCampaigns,
    queueDetail,
    ...projectOptions,
  });
  const cachedAnswer = answer('overview');
  if (rich) cachedAnswer.answer.sections = richSections();
  const workflowUser = { id: '11111111-1111-4111-8111-111111111111', email: 'tester@branddi.test' };
  const workflowContext = {
    db: memoryDb({ crm_answers: [{ ...cachedAnswer, user_id: workflowUser.id }] }),
    user: workflowUser,
    snapshot: { ...snapshot, user_id: workflowUser.id, company_id: 'co' },
    currentDeal: { id: 7, owner_id: 9 },
    sources: [
      {
        id: 'deal:7',
        recordId: '7',
        kind: 'deal',
        text: 'Título: Lume | Brand Bidding\nOrganização: 250\ncustom_fields.Relatório Brand Bidding: https://report.branddi.com/report/teste',
      },
      {
        id: 'organization:250',
        recordId: '250',
        kind: 'organization',
        text: 'Nome: Lume\nSite: lume.example.test',
      },
      ...(company ? [{ ...companySource, text: 'deal_id: 7\n' + companySource.text }] : []),
    ],
    client: {
      get: async () => ({
        data: [
          { id: 9, name: 'SDR Teste', active_flag: true },
          { id: 10, name: 'Closer Teste', active_flag: true },
        ],
      }),
    },
    validate: (material, scope) =>
      validateMaterial(material, scope, {
        read: async () => ({
          title: 'Lume — Brand Bidding',
          text: `Relatório Lume — Brand Bidding. Domínio: lume.example.test. Gerado em: ${new Date().toISOString().slice(0, 10)}. Contexto e diagnóstico comercial da marca com detalhes e recomendações.`,
        }),
      }),
  };
  if (operational) {
    const readAt = new Date().toISOString();
    workflowContext.snapshot.title = 'Lume | Brand Bidding';
    workflowContext.pages = [
      {
        kind: 'operational',
        task_key: 'f'.repeat(64),
        payload: {
          data: {
            id: 'serp',
            name: 'SERP Monitor',
            readerVersion: 'crm-operational-v1',
            readAt,
            status: 'read',
            facts: {
              state: 'complete',
              coverage: {
                campaigns_complete: true,
                executions_complete: true,
                queue_complete: true,
              },
              field_issues: [],
              campaigns: [
                {
                  id: 'synthetic-c1',
                  created_at: readAt,
                  expires_at: readAt,
                  status: 'completed',
                  queued_tasks: 0,
                  configuration: {
                    keywords: ['lume'],
                    cities: ['São Paulo'],
                    devices: ['desktop'],
                    search_engines: ['google'],
                  },
                  executions: [
                    {
                      id: 'synthetic-e1',
                      status: 'low_volume',
                      finished_at: readAt,
                      error_tasks: 2,
                      planned_tasks: 10,
                      queue_completed_tasks: 10,
                      terminal_queue_failures: 0,
                      tasks_with_ads: 0,
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    ];
    workflowContext.sources.push(...buildSources(workflowContext.pages));
  }
  let isConnected = connected,
    steps = 0;
  await page.addInitScript(() => {
    const session = {
      access_token: 'synthetic-access-token',
      refresh_token: 'synthetic-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'tester@branddi.test',
        email_confirmed_at: '2026-01-01',
        app_metadata: { provider: 'google' },
        user_metadata: {},
      },
    };
    localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
    localStorage.setItem('pipedriveToken', 'legacy-secret');
  });
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/intelligence', async (route) => {
    const request = route.request().postDataJSON();
    calls.push(request);
    expect(route.request().headers().authorization).toBe('Bearer synthetic-access-token');
    let body;
    switch (request.action) {
      case 'projectContext':
      case 'prepareProjectAction':
      case 'approveProjectAction':
      case 'projectExecution':
        body = project(request);
        break;
      case 'preparation':
      case 'saveScope':
      case 'savePreparationTask':
      case 'validateMaterial':
        try {
          body = await preparationAction(request, workflowContext);
        } catch (error) {
          return route.fulfill({
            status: error.status || 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: error.message, code: error.code }),
          });
        }
        break;
      case 'status':
        body = {
          connection: isConnected ? { company_id: 'co' } : null,
          model: 'synthetic-model',
          analysisConfigured: true,
        };
        break;
      case 'connect':
        isConnected = true;
        body = { connected: true };
        break;
      case 'disconnect':
        isConnected = false;
        body = { connected: false };
        break;
      case 'latest':
        body = cached
          ? { snapshot, answers: savedAnswers || [cachedAnswer] }
          : { snapshot: null, answers: [] };
        break;
      case 'start':
        body = {
          snapshot: {
            ...snapshot,
            status: 'collecting',
            completed_at: null,
            completed_tasks: 0,
            remainingTasks: 1,
            gaps: [],
          },
        };
        break;
      case 'step':
        steps++;
        if (coreFirst && steps === 1) {
          body = {
            snapshot: {
              ...snapshot,
              status: 'collecting',
              completed_at: null,
              analysisReady: true,
              completed_tasks: 19,
              remainingTasks: 1,
              pendingAttachments: 1,
            },
          };
          break;
        }
        body = {
          snapshot:
            steps < 2
              ? {
                  ...snapshot,
                  status: 'collecting',
                  completed_at: null,
                  completed_tasks: 1,
                  remainingTasks: 19,
                }
              : snapshot,
        };
        break;
      case 'list':
        body = { snapshots: [snapshot], hasMore: false };
        break;
      case 'get':
        body = { snapshot };
        break;
      case 'answers':
        body = { answers: [] };
        break;
      case 'answer':
        if (failAnalysis)
          return route.fulfill({
            status: 502,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'A IA retornou conteúdo inválido.' }),
          });
        body = { answer: answer(request.mode, request.question) };
        break;
      case 'sources':
        body = { sources: [source], total: 1 };
        break;
      case 'text':
        body = { text: source.text, totalCharacters: source.text.length, nextOffset: null };
        break;
      case 'readSpreadsheets':
        body = {
          files: [],
          processed: spreadsheetBatches > 0 ? 2 : 0,
          remaining: Math.max(0, spreadsheetBatches-- * 2),
        };
        break;
      case 'spreadsheets':
        body = {
          files: [{ id: 'file-7', name: 'evidencias.xlsx', status: 'readable', characters: 420 }],
        };
        break;
      case 'materials':
        body = {
          materials: [
            {
              title: 'Relatório Brand Bidding',
              url: 'https://report.branddi.com/report/teste',
              sourceId: source.id,
              quote: source.text,
              date: source.date,
            },
          ],
        };
        break;
      case 'company':
        body = company ? companyProfile : { organizationId: null, facts: [], warnings: [] };
        break;
      case 'source':
        body = { source: request.sourceId === companySource.id ? companySource : source };
        break;
      case 'raw':
        body = {
          page: {
            task_key: source.taskKey,
            payload: { success: true, data: [{ id: 1, content: source.text }] },
          },
        };
        break;
      default:
        throw new Error(`Unexpected action ${request.action}`);
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/');
  return calls;
}
test('connects without persisting token and extracts before analyzing with evidence', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const calls = await fixture(page, { connected: false });
  await page.getByLabel('Token Pipedrive').fill('synthetic-pipedrive-token-value');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await expect(page.getByText('20 etapas preservadas', { exact: false })).toBeAttached();
  await expect(
    page.locator('.briefing-grid').getByText('A reunião foi confirmada pelo cliente.'),
  ).toBeVisible();
  expect(calls.some((call) => call.action === 'answer' && call.mode === 'overview')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('pipedriveToken'))).toBeNull();
  await page.getByRole('button', { name: 'Atualizar briefing', exact: true }).click();
  await expect(
    page.locator('.briefing-grid').getByText('A reunião foi confirmada pelo cliente.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Abrir fonte/ })).toHaveCount(0);
  await page.getByText('Consulta técnica · dados preservados', { exact: true }).click();
  await page.getByRole('button', { name: 'Carregar dados e fontes', exact: true }).click();
  await page.getByRole('button', { name: 'Ler texto consolidado' }).click();
  await expect(page.locator('.raw-text')).toContainText(source.text);
  await page.getByRole('button', { name: 'Ver original', exact: true }).click();
  await expect(page.getByText('Resposta original do CRM')).toBeVisible();
  await page.screenshot({ path: 'test-results/crm-sources-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('saved briefing displays organization and group evidence without another model call', async ({
  page,
}) => {
  const calls = await fixture(page, { cached: true, company: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: 'Contexto da empresa e do grupo' }).click();
  const board = page.getByRole('dialog');
  await expect(board).toContainText('Grupo empresarial: Pertence ao Grupo Arco.');
  await expect(board).toContainText('Empresa: Lume');
  await expect(board).toContainText('Registro interno');
  await expect(board.getByRole('button', { name: /fonte/ })).toHaveCount(0);
  await expect(board.getByText('Sem conclusão nesta análise')).toHaveCount(0);

  await expect(page.getByRole('dialog')).toContainText('Organização #250');
  await expect(page.getByRole('dialog').getByText(companySource.text, { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('dialog').getByText('Pontos a conferir (1)', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('não está preenchido no cadastro');
  expect(calls.some((call) => ['answer', 'start', 'step'].includes(call.action))).toBe(false);
  await page.getByRole('button', { name: 'Fechar painel', exact: true }).click();
  await page.setViewportSize({ width: 1536, height: 1100 });
  await page.screenshot({ path: 'test-results/company-briefing-desktop.png', fullPage: true });
  const heights = await page
    .locator('.briefing-board')
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
  expect(heights.every((h) => h > 0)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('saved versions stay visibly historical and answer user questions', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Extrações salvas', exact: true }).click();
  await page.getByRole('button', { name: /#7 · Conta de demonstração/ }).click();
  await expect(page.getByText('Versão histórica carregada.', { exact: false })).toBeVisible();
  await page
    .getByLabel('O que você precisa saber sobre este negócio?')
    .fill('Qual foi o último compromisso?');
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await expect(
    page.getByRole('paragraph').filter({ hasText: /^Qual foi o último compromisso\?$/ }),
  ).toBeVisible();
  await expect(page.locator('.briefing-grid')).toBeVisible();
  await expect(page.getByRole('button', { name: /Abrir fonte/ })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Visões do negócio' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Empresa e pessoas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Carregar dados e fontes' })).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/crm-question-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('invalid AI response displays an error and preserves extracted data', async ({ page }) => {
  await fixture(page, { failAnalysis: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio' }).click();
  await expect(page.getByText('20 etapas preservadas', { exact: false })).toBeAttached();
  await expect(page.getByRole('alert')).toContainText('A IA retornou conteúdo inválido.');
  await expect(page.getByText('Conta de demonstração', { exact: true })).toBeVisible();
  await page.getByText('Consulta técnica · dados preservados', { exact: true }).click();
  await page.getByRole('button', { name: 'Carregar dados e fontes', exact: true }).click();
  await expect(page.getByText('Compromisso do cliente', { exact: true })).toBeVisible();
});
test('logout clears visible account data', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeVisible();
  await expect(page.getByLabel('ID do negócio')).toHaveCount(0);
});

test('opens a saved analysis without another extraction or model call', async ({ page }) => {
  const calls = await fixture(page, { cached: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await expect(
    page.locator('.briefing-grid').getByText('A reunião foi confirmada pelo cliente.'),
  ).toBeVisible();
  expect(calls.some((call) => ['start', 'step', 'answer'].includes(call.action))).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/crm-overview-desktop.png', fullPage: false });
});
test('generates an automatic result before collecting remaining attachments', async ({ page }) => {
  const calls = await fixture(page, { coreFirst: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await expect(
    page.locator('.briefing-grid').getByText('A reunião foi confirmada pelo cliente.'),
  ).toBeVisible();
  await expect(page.getByText('Coleta finalizada.', { exact: false })).toBeVisible();
  const actions = calls
    .filter((call) => ['step', 'answer'].includes(call.action))
    .map((call) => call.action);
  expect(actions).toEqual(['step', 'answer', 'step']);
});
test('connection and navigation remain usable on a narrow screen', async ({ page }) => {
  await fixture(page, { connected: false });
  await page.screenshot({ path: 'test-results/crm-connection-desktop.png', fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Token Pipedrive')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/crm-connection-mobile.png', fullPage: true });
});

function richSections() {
  const titles = [
    'Empresa e grupo',
    'Pessoas e papéis',
    'Histórico comercial',
    'Diagnóstico e oportunidade',
    'Abordagem e próximos passos',
    'Reunião e materiais',
  ];
  const categories = ['company', 'people', 'history', 'opportunity', 'approach', 'meeting'];
  const texts = [
    [
      'Empresa de varejo com presença nacional e operação digital. O registro cita um grupo econômico; confirme a relação entre as marcas antes de estender o escopo.',
      'A marca e o domínio foram registrados no CRM. A abrangência sobre outras unidades ainda precisa ser validada.',
    ],
    [
      'O cargo diverge entre o cadastro e a assinatura do e-mail. Confirme a função e a abrangência do contato sobre as marcas do grupo.',
      'Existem contatos de marketing e e-commerce vinculados à organização. O cadastro não comprova participação na decisão.',
    ],
    [
      'O contato respondeu à abordagem e demonstrou interesse em conhecer o diagnóstico. A resposta foi registrada no histórico.',
      'Há uma recusa antiga de outro contato. Respeite o contexto e confirme se houve mudança de cenário.',
    ],
    [
      'A monitoria registra anunciantes associados aos termos de marca. Verifique se são concorrentes, afiliados ou empresas do grupo.',
      'A economia indicada no relatório é uma estimativa, sem comprovação de perda declarada pelo cliente.',
    ],
    [
      'Apresente o diagnóstico mais recente e pergunte como o contato acompanha o tema hoje. Confirme quais decisões estão no seu escopo.',
      'O relatório diverge da nota comercial quanto ao número de anunciantes; compare as datas e os termos monitorados.',
    ],
    [
      'O convite registra uma reunião para a próxima semana. O envio do convite não confirma o aceite dos participantes.',
      'Há um link de apresentação no card e uma atividade de preparação em aberto. O link não prova que o material foi revisado.',
    ],
  ];
  return titles.map((title, i) => ({
    title,
    claims: [...texts[i], 'Conclusão adicional preservada para leitura no painel lateral.'].map(
      (text, j) => ({
        text,
        category: categories[i],
        kind: i === 4 && j === 0 ? 'recommendation' : 'fact',
        citations: [{ sourceId: source.id, quote: source.text }],
      }),
    ),
  }));
}

test('Briefing 360 keeps six symmetric boards, preserves details without mode selection or automatic generation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1100 });
  const calls = await fixture(page, { cached: true, rich: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  const cards = page.locator('.briefing-board');
  await expect(cards).toHaveCount(6);
  const rectangles = await cards.evaluateAll((items) =>
    items.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  expect(
    Math.max(...rectangles.map((r) => r.width)) - Math.min(...rectangles.map((r) => r.width)),
  ).toBeLessThan(2);
  expect(Math.abs(rectangles[0].height - rectangles[1].height)).toBeLessThan(2);
  expect(rectangles[0].y).toBe(rectangles[1].y);
  await page.screenshot({ path: 'test-results/briefing-360-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Ver quadro completo' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Conclusão adicional preservada');
  await page.getByRole('dialog').getByText('O que conferir neste quadro', { exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', {
      name: 'Já houve reunião? Quando, com quem e por que não avançou?',
    })
    .click();
  await expect(page.getByLabel('O que você precisa saber sobre este negócio?')).toBeFocused();
  await expect(page.getByLabel('O que você precisa saber sobre este negócio?')).toHaveValue(
    'Já houve reunião? Quando, com quem e por que não avançou?',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Objetivo do briefing' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Pré-prospecção|Pré-reunião/ })).toHaveCount(0);
  expect(calls.some((call) => call.action === 'answer')).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(cards).toHaveCount(6);
  await page.screenshot({ path: 'test-results/briefing-360-mobile.png', fullPage: true });
});

test('persists an individually approved helpdesk draft and never approves the other issue', async ({
  page,
}) => {
  const calls = await fixture(page, { cached: true, rich: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: 'Pendências e erros' }).click();
  const row = page
    .locator('.workflow-task-list article')
    .filter({ has: page.getByRole('heading', { name: 'Pessoas e papéis', exact: true }) });
  await row.getByRole('button', { name: 'Revisar pendência' }).click();
  await page.getByRole('combobox', { name: 'Responsável', exact: true }).selectOption('10');
  await page.getByLabel('Observação da revisão').fill('Conferido o cargo com o registro original.');
  await page.getByText('Chamado individual no Hub RevOps', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Continuar no Hub' })).toHaveCount(0);
  await page.getByLabel('Título do chamado').fill('Verificar cargo do contato');
  await page.getByLabel('Confirmo este erro e aprovo somente este chamado.').check();
  await page.getByRole('button', { name: 'Salvar e aprovar este chamado' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: 'Pendências e erros' }).click();
  await expect(row).toContainText('Closer Teste');
  await expect(
    page.getByText('Chamado aprovado para revisão no Hub', { exact: false }),
  ).toHaveCount(1);
  await row.getByRole('button', { name: 'Revisar pendência' }).click();
  const link = page.getByRole('link', { name: 'Continuar no Hub' });
  const url = new URL(await link.getAttribute('href'));
  expect(url.origin).toBe('https://revops.branddi.com');
  expect(url.pathname).toBe('/operacao/central-revops/helpdesk/novo');
  expect(url.searchParams.get('texto')).toContain('Verificar cargo do contato');
  expect(url.searchParams.get('texto')).not.toContain('relatório diverge');
  await page
    .getByLabel('Descrição do chamado')
    .fill('Texto corrigido para revisão individual antes de aprovar novamente.');
  await expect(link).toHaveCount(0);
  expect(
    calls.filter((call) => call.action === 'savePreparationTask' && call.approveHelpdesk),
  ).toHaveLength(1);
});

test('saving a recommendation keeps execution behind the project approval flow', async ({
  page,
}) => {
  const calls = await fixture(page, { cached: true, rich: true, operational: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await expect(page.getByLabel('Consultas operacionais')).toContainText('SERP Monitor: Consultado');
  await page.getByRole('button', { name: 'Pendências e erros' }).click();
  const row = page.locator('.workflow-task-list article').filter({
    has: page.getByRole('heading', { name: 'Revisar alcance da monitoria', exact: true }),
  });
  await row.getByRole('button', { name: 'Revisar pendência' }).click();
  await page
    .getByLabel('Observação da revisão')
    .fill('Conferi a cobertura e proponho revisar apenas termos de marca.');
  await expect(
    page.getByText('Salvar esta pendência não inicia uma operação.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Salvar pendência', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await row.getByRole('button', { name: 'Revisar pendência' }).click();
  await expect(page.getByRole('dialog')).toContainText('personalizar e aprovar a execução');
  expect(calls.filter((c) => c.approveRecommendation)).toHaveLength(0);
  expect(calls.some((c) => c.approveHelpdesk)).toBe(false);
  expect(calls.some((c) => /generate|monitoria|execute/.test(c.action))).toBe(false);
});

test('group notice saves explicit scope; material reading, assignment and completion survive reload', async ({
  page,
}) => {
  await fixture(page, { cached: true, company: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Aviso de grupo' })).toContainText('Grupo Arco');
  await page.setViewportSize({ width: 1536, height: 1100 });
  await page.screenshot({ path: 'test-results/group-workflow-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/group-workflow-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Definir escopo', exact: true }).click();
  await page.getByLabel('Produto', { exact: true }).fill('Brand Bidding');
  await page.getByRole('button', { name: 'Salvar escopo' }).click();
  await expect(page.getByRole('region', { name: 'Aviso de grupo' })).toContainText('Escopo: Lume');
  await page.getByRole('button', { name: 'Relatórios e materiais', exact: true }).click();
  await page.getByRole('button', { name: 'Verificar conteúdo' }).click();
  await expect(page.getByRole('region', { name: 'Planilhas do card' })).toContainText(
    'evidencias.xlsx',
  );
  await expect(
    page.getByText('Texto compatível · revisão final pendente', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Revisar pendência', exact: true }).click();
  await page.getByRole('combobox', { name: 'Responsável', exact: true }).selectOption('10');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('resolved');
  await page
    .getByLabel('Observação da revisão')
    .fill('Apresentação visual e diagnóstico revisados para a marca Lume.');
  await page.getByRole('button', { name: 'Salvar pendência', exact: true }).click();
  await page.reload();
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Aviso de grupo' })).toContainText('Escopo: Lume');
  await page.getByRole('button', { name: 'Pendências e erros' }).click();
  await page.getByText(/Concluídas e versões anteriores/).click();
  await page.getByRole('button', { name: 'Revisar Relatório Brand Bidding Concluída' }).click();
  await expect(page.getByRole('combobox', { name: 'Responsável', exact: true })).toHaveValue('10');
  await expect(page.getByLabel('Observação da revisão')).toHaveValue(
    'Apresentação visual e diagnóstico revisados para a marca Lume.',
  );
});

test('failed persistence never presents a successful save or an approved ticket', async ({
  page,
}) => {
  await fixture(page, { cached: true, company: true });
  await page.route('**/api/intelligence', async (route) =>
    route.request().postDataJSON().action === 'saveScope'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Armazenamento indisponível.' }),
        })
      : route.fallback(),
  );
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: 'Definir escopo', exact: true }).click();
  await page.getByLabel('Produto', { exact: true }).fill('Brand Bidding');
  await page.getByRole('button', { name: 'Salvar escopo' }).click();
  await expect(page.getByRole('alert')).toContainText('Armazenamento indisponível.');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Preparação salva.', { exact: true })).toHaveCount(0);
});

test('one briefing keeps legacy versions and question selection independent, then updates the unified analysis', async ({
  page,
}) => {
  const older = {
    ...answer('briefing'),
    id: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-10-17T12:00:00Z',
  };
  older.answer.sections[0].claims[0].text = 'Compromisso preservado da versão anterior.';
  const recent = {
    ...answer('prospecting'),
    id: '55555555-5555-4555-8555-555555555555',
    created_at: '2026-10-17T12:01:00Z',
  };
  recent.answer.sections[0].claims[0].text = 'Contexto comercial recente.';
  const question = {
    ...answer('question', 'Pergunta antiga'),
    id: '66666666-6666-4666-8666-666666666666',
    created_at: '2026-10-17T12:03:00Z',
  };
  const calls = await fixture(page, { cached: true, savedAnswers: [older, question, recent] });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await expect(page.locator('.briefing-grid')).toContainText('Contexto comercial recente.');
  await page.getByText('Ler análise completa e versões anteriores', { exact: true }).click();
  const versions = page.getByLabel('Versão da análise', { exact: true });
  await expect(versions.locator('option')).toHaveCount(2);
  await versions.selectOption(older.id);
  await expect(page.locator('.briefing-grid')).toContainText(
    'Compromisso preservado da versão anterior.',
  );
  await page
    .getByLabel('O que você precisa saber sobre este negócio?')
    .fill('Qual a próxima ação?');
  await page.getByRole('button', { name: 'Perguntar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Perguntas sobre o briefing' })).toContainText(
    'Qual a próxima ação?',
  );
  await expect(versions).toHaveValue(older.id);
  await expect(page.locator('.briefing-grid')).toContainText(
    'Compromisso preservado da versão anterior.',
  );
  await page.getByRole('button', { name: 'Atualizar briefing', exact: true }).click();
  await expect(page.locator('.briefing-grid')).toContainText(
    'A reunião foi confirmada pelo cliente.',
  );
  expect(calls.filter((call) => call.action === 'answer').map((call) => call.mode)).toEqual([
    'question',
    'overview',
  ]);
  expect(calls.some((call) => ['start', 'step'].includes(call.action))).toBe(false);
});

test('finishes resumable spreadsheet reads before calling the model', async ({ page }) => {
  const calls = await fixture(page, { cached: true, spreadsheetBatches: 2 });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: 'Atualizar briefing', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Briefing atualizado.' })).toBeVisible();
  expect(
    calls.filter((c) => ['readSpreadsheets', 'answer'].includes(c.action)).map((c) => c.action),
  ).toEqual(['readSpreadsheets', 'readSpreadsheets', 'readSpreadsheets', 'answer']);
});

test('project tools keep SERP and report approvals independent and show durable results', async ({
  page,
}) => {
  const calls = await fixture(page, { cached: true, rich: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  for (const name of ['SERP Monitor', 'Report Engine']) {
    await page
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Personalizar reprocessamento' }).click();
    if (name === 'Report Engine')
      await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
    await page
      .getByLabel(
        name === 'Report Engine'
          ? 'Justificativa da atualização'
          : 'Objetivo deste reprocessamento',
      )
      .fill('Validar a cobertura da marca com as evidências mais recentes.');
    await page
      .getByRole('button', {
        name:
          name === 'Report Engine'
            ? 'Salvar proposta para aprovação'
            : 'Revisar aprovação individual',
      })
      .click();
    const approve = page.getByRole('button', {
      name: `Aprovar e executar no ${name}`,
      exact: true,
    });
    await expect(approve).toBeDisabled();
    await page
      .getByLabel('Aprovo somente esta ação, com os parâmetros e efeitos descritos.')
      .check();
    await approve.click();
    await expect(page.getByText('Pedido recebido pelo projeto.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Consultar execução existente' }).click();
    await expect(
      page.getByText('Resultado confirmado no projeto. Briefing pode ser atualizado.', {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Voltar ao briefing', exact: true }).click();
  }
  expect(calls.filter((c) => c.action === 'approveProjectAction')).toHaveLength(2);
  expect(
    calls.filter((c) => c.action === 'prepareProjectAction').map((c) => c.parameters.system),
  ).toEqual(['serp', 'reports']);
  expect(calls.find((c) => c.action === 'prepareProjectAction').parameters.cities).toEqual([
    'São Paulo,Brazil',
    'Campinas,Brazil',
  ]);
});

test('scope conflict refreshes the revision without losing typed fields', async ({ page }) => {
  await fixture(page, { cached: true, company: true });
  let conflict = true;
  await page.route('**/api/intelligence', async (route) => {
    if (route.request().postDataJSON().action === 'saveScope' && conflict) {
      conflict = false;
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'A preparação mudou.', code: 'workflow_conflict' }),
      });
    }
    return route.fallback();
  });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: 'Definir escopo', exact: true }).click();
  await page.getByLabel('Produto', { exact: true }).fill('Brand Bidding — piloto de validação');
  await page.getByRole('button', { name: 'Salvar escopo' }).click();
  await expect(page.getByRole('alert')).toContainText('Seus campos foram mantidos');
  await expect(page.getByLabel('Produto', { exact: true })).toHaveValue(
    'Brand Bidding — piloto de validação',
  );
  await page.getByRole('button', { name: 'Salvar escopo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Aviso de grupo' })).toContainText(
    'piloto de validação',
  );
});

test('monitoring can be customized before scope confirmation and saved as an unapproved draft', async ({
  page,
}) => {
  const calls = await fixture(page, { cached: true, company: true, projectScopeConfirmed: false });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: /SERP Monitor Cobertura/ }).click();
  await page.getByRole('button', { name: 'Personalizar reprocessamento' }).click();
  await page.getByRole('button', { name: 'Remover cidade Campinas', exact: true }).click();
  await page.getByText('Selecionar cidades', { exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar cidade' }).fill('recife');
  await page.getByRole('checkbox', { name: 'Recife', exact: true }).check();
  await page.getByRole('button', { name: 'Concluir seleção' }).click();
  await page.getByLabel('Teto total de consultas').fill('48');
  await expect(page.getByRole('button', { name: 'Revisar aprovação individual' })).toBeDisabled();
  await page.getByRole('button', { name: 'Confirmar escopo aqui' }).click();
  await page.getByRole('dialog').getByLabel('Produto', { exact: true }).fill('Brand Bidding');
  await page.getByRole('button', { name: 'Salvar escopo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Remover cidade Recife', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remover cidade São Paulo', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Remover cidade Campinas', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Teto total de consultas')).toHaveValue('48');
  await page
    .getByLabel('Objetivo deste reprocessamento')
    .fill('Validar nova captura antes de ampliar o alcance.');
  await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
  await expect(
    page.getByRole('button', { name: 'Aprovar e executar no SERP Monitor' }),
  ).toBeDisabled();
  expect(calls.filter((c) => c.action === 'approveProjectAction')).toHaveLength(0);
  await page.getByText('Propostas salvas e histórico', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Aguardando aprovação/ })).toBeVisible();
});

test('scheduled monitoring is visible with its time without starting a new execution', async ({
  page,
}) => {
  const calls = await fixture(page, {
    cached: true,
    company: true,
    queueDetail: {
      observed_at: '2026-10-30T20:00:00Z',
      ready_tasks: 0,
      scheduled_tasks: 162,
      processing_tasks: 0,
      stale_processing_tasks: 0,
      unknown_schedule_tasks: 0,
      next_scheduled_at: '2026-10-30T22:00:00Z',
      oldest_ready_at: null,
      last_updated_at: null,
    },
  });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: /SERP Monitor Cobertura/ }).click();
  await expect(
    page.getByText('162 agendadas · 0 aguardando processamento · 0 em execução'),
  ).toBeVisible();
  await expect(page.getByText(/Próximo horário:/)).toBeVisible();
  await expect(page.getByText(/Nova coleta liberada quando a fila zerar/)).toBeVisible();
  expect(
    calls.filter((c) => ['prepareProjectAction', 'approveProjectAction'].includes(c.action)),
  ).toHaveLength(0);
});

test('report starts with combined evidence, permits manual selection and keeps approval separate', async ({
  page,
}) => {
  const calls = await fixture(page, { cached: true, company: true, multipleCampaigns: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: /Report Engine Evidências/ }).click();
  await page.getByRole('button', { name: 'Personalizar reprocessamento' }).click();
  await expect(page.getByRole('group', { name: 'Palavras-chave incluídas' })).toBeHidden();
  await page.getByText('Filtros avançados · 2 de 2 palavras-chave').click();
  await expect(page.getByRole('checkbox', { name: 'lume promoção', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: /synthetic-c2/ }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'lume promoção', exact: true })).toHaveCount(0);
  await page.getByLabel('Período das evidências (dias)').fill('7');
  await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
  await page
    .getByLabel('Justificativa da atualização')
    .fill('Reprocessar a campanha selecionada na janela personalizada.');
  await page.getByRole('button', { name: 'Salvar proposta para aprovação' }).click();
  const prepared = calls.filter((c) => c.action === 'prepareProjectAction').at(-1);
  expect(prepared.parameters.campaignIds).toEqual(['synthetic-c1']);
  expect(prepared.parameters.lookbackDays).toBe(7);
  expect(calls.filter((c) => c.action === 'approveProjectAction')).toHaveLength(0);
  await expect(
    page.getByRole('button', { name: 'Aprovar e executar no Report Engine' }),
  ).toBeDisabled();
  await expect(page.getByText(/Prioriza mais anunciantes/)).toBeVisible();
});

test('existing ready queue can be prioritized only after its own explicit approval', async ({
  page,
}) => {
  const calls = await fixture(page, {
    cached: true,
    company: true,
    queueDetail: {
      observed_at: new Date().toISOString(),
      ready_tasks: 162,
      eligible_ready_tasks: 162,
      tasks_ahead: 900,
      scheduled_tasks: 0,
      processing_tasks: 0,
      stale_processing_tasks: 0,
      unknown_schedule_tasks: 0,
      next_scheduled_at: null,
      oldest_ready_at: '2026-10-30T12:00:00Z',
      last_updated_at: null,
    },
  });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: /SERP Monitor Cobertura/ }).click();
  await expect(page.getByText('900 tarefas elegíveis à frente desta coleta.')).toBeVisible();
  await page.getByRole('button', { name: 'Priorizar coleta existente', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Responsável').selectOption('10');
  await page
    .getByRole('dialog')
    .getByLabel('Motivo')
    .fill('Concluir a coleta atual sem cancelar ou recriar buscas.');
  await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
  await expect(
    page.getByRole('button', { name: 'Aprovar e executar no SERP Monitor' }),
  ).toBeDisabled();
  expect(calls.filter((c) => c.action === 'approveProjectAction')).toHaveLength(0);
  const draft = calls.find((c) => c.action === 'prepareProjectAction');
  expect(draft.parameters).toMatchObject({
    system: 'serp',
    action: 'prioritize',
    campaignId: 'synthetic-c1',
    expectedReadyTasks: 162,
  });
  expect(draft.assigneeId).toBe('10');
  await page.getByRole('checkbox', { name: /Aprovo somente esta ação/ }).check();
  await page.getByRole('button', { name: 'Aprovar e executar no SERP Monitor' }).click();
  await expect(page.getByText('Pedido recebido pelo projeto.')).toBeVisible();
  expect(calls.filter((c) => c.action === 'approveProjectAction')).toHaveLength(1);
});

test('city picker searches without accents, preserves exact payload and caps selection at ten', async ({
  page,
}) => {
  const calls = await fixture(page, { cached: true, company: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: /SERP Monitor Cobertura/ }).click();
  await page.getByRole('button', { name: 'Personalizar reprocessamento' }).click();
  await page.getByText('Selecionar cidades', { exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Buscar cidade' });
  await search.fill('sao jose');
  const city = page.getByRole('checkbox', { name: 'São José dos Campos', exact: true });
  await city.focus();
  await page.keyboard.press('Space');
  await expect(city).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Remover cidade São José dos Campos' }),
  ).toHaveCount(1);
  await search.fill('zzzz');
  await expect(page.getByText('Nenhuma cidade encontrada. Tente outro nome.')).toBeVisible();
  await search.fill('');
  for (const name of [
    'Recife',
    'Natal',
    'Manaus',
    'Salvador',
    'Fortaleza',
    'Curitiba',
    'Guarulhos',
  ]) {
    await page.getByRole('checkbox', { name, exact: true }).check();
  }
  await expect(page.getByText('10 de 10 selecionadas', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Santos', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(search).not.toBeVisible();
  await page.getByRole('button', { name: 'Remover cidade Campinas', exact: true }).click();
  await page.getByText('Selecionar cidades', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Santos', exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await page.locator('.city-picker-panel').boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Concluir seleção' }).click();
  await page
    .getByLabel('Objetivo deste reprocessamento')
    .fill('Validar seleção de cidades sem digitação de códigos.');
  await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
  const params = calls.find((c) => c.action === 'prepareProjectAction').parameters;
  expect(params.cities).toEqual([
    'São Paulo,Brazil',
    'São José dos Campos,Brazil',
    'Recife,Brazil',
    'Natal,Brazil',
    'Manaus,Brazil',
    'Salvador,Brazil',
    'Fortaleza,Brazil',
    'Curitiba,Brazil',
    'Guarulhos,Brazil',
    'Santos,Brazil',
  ]);
  expect(calls.filter((c) => c.action === 'approveProjectAction')).toHaveLength(0);
});

test('report filters select only completed captures, preserve manual choices and adapt to the period', async ({
  page,
}) => {
  const calls = await fixture(page, {
    cached: true,
    multipleCampaigns: true,
    projectOptions: { mixedCampaigns: true },
  });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: /Report Engine Evidências/ }).click();
  await page.getByRole('button', { name: 'Personalizar reprocessamento' }).click();
  const collections = page.getByRole('group', { name: 'Coletas concluídas', exact: true });
  await expect(collections.getByRole('checkbox')).toHaveCount(3);
  await expect(
    collections.getByRole('checkbox', { name: /queued|running|too-old|incomplete/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Responsável', exact: true })).toHaveCount(0);
  await page.getByLabel('Período das evidências (dias)').fill('7');
  await expect(collections.getByRole('checkbox')).toHaveCount(2);
  await page.getByLabel('Período das evidências (dias)').fill('30');
  await expect(collections.getByRole('checkbox', { name: /older-valid/ })).toBeChecked();
  await page.getByText('Filtros avançados · 2 de 2 palavras-chave').click();
  await page.getByRole('checkbox', { name: 'lume promoção', exact: true }).uncheck();
  await collections.getByRole('checkbox', { name: /synthetic-c1/ }).uncheck();
  await page.getByLabel('Período das evidências (dias)').fill('7');
  await expect(page.getByRole('button', { name: 'Revisar aprovação individual' })).toBeDisabled();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Selecione ao menos uma palavra-chave' }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: 'lume promoção', exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
  expect(calls.filter((c) => c.action === 'prepareProjectAction')).toHaveLength(0);
  await page.getByRole('combobox', { name: 'Responsável', exact: true }).selectOption('10');
  await page.getByRole('button', { name: 'Voltar aos filtros' }).click();
  await expect(collections.getByRole('checkbox', { name: /synthetic-c1/ })).not.toBeChecked();
  await expect(collections.getByRole('checkbox', { name: /synthetic-c2/ })).toBeChecked();
  await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
  await expect(page.getByRole('combobox', { name: 'Responsável', exact: true })).toHaveValue('10');
  await page.getByRole('button', { name: 'Salvar proposta para aprovação' }).click();
  const request = calls.find((c) => c.action === 'prepareProjectAction');
  expect(request.parameters).toMatchObject({
    campaignIds: ['synthetic-c2'],
    keywords: ['lume promoção'],
    lookbackDays: 7,
    brand: 'Lume',
    domain: 'lume.example.test',
    slug: 'lume',
  });
  expect(request.assigneeId).toBe('10');
  expect(calls.filter((c) => c.action === 'approveProjectAction')).toHaveLength(0);
  await page.getByRole('button', { name: 'Revisar parâmetros' }).click();
  await expect(page.getByLabel('Período das evidências (dias)')).toHaveValue('7');
  await expect(collections.getByRole('checkbox', { name: /synthetic-c2/ })).toBeChecked();
  await expect(collections.getByRole('checkbox', { name: /synthetic-c1/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
  await expect(page.getByRole('combobox', { name: 'Responsável', exact: true })).toHaveValue('10');
});

for (const scenario of [
  {
    name: 'growth',
    status: 'completed',
    counts: { previousAdvertisers: 1, publishedAdvertisers: 4 },
    before: '1',
    after: '4',
    message: '+3 anunciantes distintos',
  },
  {
    name: 'preserved',
    status: 'preserved',
    counts: { previousAdvertisers: 4, publishedAdvertisers: 4 },
    before: '4',
    after: '4',
    message: 'A versão anterior foi preservada',
  },
  {
    name: 'zero',
    status: 'completed',
    counts: { previousAdvertisers: 0, publishedAdvertisers: 2 },
    before: '0',
    after: '2',
    message: '+2 anunciantes distintos',
  },
  {
    name: 'legacy',
    status: 'completed',
    counts: { previousAdvertisers: 2, publishedAdvertisers: 5 },
    before: 'Não informado',
    after: '4',
    message: 'Recibo antigo:',
    legacy: true,
  },
  {
    name: 'missing',
    status: 'completed',
    counts: {},
    before: 'Não informado',
    after: 'Não informado',
    message: 'O recibo não informa a comparação completa.',
  },
]) {
  test(`report shows receipt-based before/after (${scenario.name}) without another execution`, async ({
    page,
  }) => {
    const calls = await fixture(page, {
      cached: true,
      projectOptions: {
        reportStatus: scenario.status,
        reportResult: scenario.legacy
          ? scenario.counts
          : {
              publishedComparison: {
                metric: 'effective_advertisers_v1',
                before: scenario.counts.previousAdvertisers,
                after: scenario.counts.publishedAdvertisers,
              },
            },
        reportMetadataCount: scenario.legacy ? 4 : undefined,
      },
    });
    await page.getByLabel('ID do negócio').fill('7');
    await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
    await page.getByRole('button', { name: /Report Engine Evidências/ }).click();
    await page.getByRole('button', { name: 'Personalizar reprocessamento' }).click();
    await page.getByRole('button', { name: 'Revisar aprovação individual' }).click();
    await page.getByRole('button', { name: 'Salvar proposta para aprovação' }).click();
    const approve = page.getByRole('button', { name: 'Aprovar e executar no Report Engine' });
    await expect(approve).toBeDisabled();
    await page
      .getByLabel('Aprovo somente esta ação, com os parâmetros e efeitos descritos.')
      .check();
    await approve.click();
    await expect(page.getByRole('region', { name: 'Resultado do relatório' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Consultar execução existente' }).click();
    const result = page.getByRole('region', { name: 'Resultado do relatório' });
    await expect(result).toBeVisible();
    await expect(result.locator('dd').nth(0)).toHaveText(scenario.before);
    await expect(result.locator('dd').nth(1)).toHaveText(scenario.after);
    await expect(result).toContainText(scenario.message);
    await page.getByRole('button', { name: 'Análise', exact: true }).click();
    await expect(result).toBeVisible();
    expect(calls.filter((c) => c.action === 'approveProjectAction')).toHaveLength(1);
    expect(calls.filter((c) => c.action === 'prepareProjectAction')).toHaveLength(1);
    expect(calls.some((c) => ['start', 'step'].includes(c.action))).toBe(false);
  });
}

test('report empty state prevents preparing an action with pending collections', async ({
  page,
}) => {
  const calls = await fixture(page, {
    cached: true,
    queueDetail: {
      ready_tasks: 0,
      scheduled_tasks: 2,
      processing_tasks: 0,
      unknown_schedule_tasks: 0,
    },
  });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: /Report Engine Evidências/ }).click();
  await page.getByRole('button', { name: 'Personalizar reprocessamento' }).click();
  await expect(page.getByText(/Nenhuma coleta concluída neste período/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar aprovação individual' })).toBeDisabled();
  expect(
    calls.filter((c) => ['prepareProjectAction', 'approveProjectAction'].includes(c.action)),
  ).toHaveLength(0);
});
