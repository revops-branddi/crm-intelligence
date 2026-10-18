import { test, expect } from '@playwright/test';
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
  } = {},
) {
  const calls = [];
  const cachedAnswer = answer('overview');
  if (rich) cachedAnswer.answer.sections = richSections();
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
        body = cached ? { snapshot, answers: [cachedAnswer] } : { snapshot: null, answers: [] };
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
  await expect(page.getByText('20 etapas preservadas', { exact: false })).toBeVisible();
  await expect(
    page.locator('.briefing-grid').getByText('A reunião foi confirmada pelo cliente.'),
  ).toBeVisible();
  expect(calls.some((call) => call.action === 'answer' && call.mode === 'overview')).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('pipedriveToken'))).toBeNull();
  await page.getByRole('button', { name: 'Gerar briefing', exact: true }).click();
  await expect(
    page.locator('.briefing-grid').getByText('A reunião foi confirmada pelo cliente.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abrir fonte', exact: false }).click();
  await expect(page.getByRole('dialog')).toContainText(source.text);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Dados e fontes', exact: true }).click();
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
  const board = page.getByRole('region', { name: 'Empresa e grupo', exact: true });
  await expect(board).toContainText('Grupo empresarial: Pertence ao Grupo Arco.');
  await expect(board).toContainText('Empresa: Lume');
  await expect(board).toContainText('Nota interna do card');
  await expect(board).toContainText('Cadastro da organização #250');
  await expect(board.getByText('Sem conclusão nesta análise')).toHaveCount(0);
  await board.getByRole('button', { name: 'Ver quadro completo' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'base comum dos cards vinculados ao mesmo ID',
  );
  await expect(page.getByRole('dialog')).toContainText('não está preenchido no cadastro');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Abrir fonte 1/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: 'Evidência original' })).toContainText(
    companySource.text,
  );
  expect(calls.some((call) => ['answer', 'start', 'step'].includes(call.action))).toBe(false);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.setViewportSize({ width: 1536, height: 1100 });
  await page.screenshot({ path: 'test-results/company-briefing-desktop.png', fullPage: true });
  const heights = await page
    .locator('.briefing-board')
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
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
  await page.getByRole('button', { name: 'Perguntas', exact: true }).click();
  await page
    .getByLabel('O que você precisa saber sobre este negócio?')
    .fill('Qual foi o último compromisso?');
  await page.getByRole('button', { name: 'Responder com fontes' }).click();
  await expect(
    page.getByRole('paragraph').filter({ hasText: /^Qual foi o último compromisso\?$/ }),
  ).toBeVisible();
  await expect(page.getByText('Fato registrado', { exact: true })).toBeVisible();
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
  await expect(page.getByText('20 etapas preservadas', { exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('A IA retornou conteúdo inválido.');
  await expect(page.getByText('Conta de demonstração', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dados e fontes', exact: true }).click();
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

test('Briefing 360 keeps six symmetric boards, preserves details and switches modes without generating', async ({
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
  expect(
    Math.max(...rectangles.map((r) => r.height)) - Math.min(...rectangles.map((r) => r.height)),
  ).toBeLessThan(2);
  expect(rectangles[0].y).toBe(rectangles[2].y);
  await page.screenshot({ path: 'test-results/briefing-360-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Ver quadro completo' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Conclusão adicional preservada');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pré-prospecção', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pré-prospecção', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(calls.some((call) => call.action === 'answer')).toBe(false);
  await page.getByRole('button', { name: 'Revisar preparação' }).click();
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await page.getByRole('button', { name: 'Perguntas', exact: true }).click();
  await page.getByRole('button', { name: 'Briefing 360', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar preparação' }).click();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(cards).toHaveCount(6);
  await page.screenshot({ path: 'test-results/briefing-360-mobile.png', fullPage: true });
});

test('reviews one occurrence at a time and hands an editable draft to the canonical Hub flow', async ({
  page,
}) => {
  await fixture(page, { cached: true, rich: true });
  await page.getByLabel('ID do negócio').fill('7');
  await page.getByRole('button', { name: 'Analisar negócio', exact: true }).click();
  await page.getByRole('button', { name: 'Pendências e erros' }).click();
  await expect(page.getByText('2 a validar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar ocorrência' }).first().click();
  await page.getByLabel('Título', { exact: true }).fill('Verificar cargo do contato');
  const link = page.getByRole('link', { name: 'Revisar e continuar no Hub' });
  const url = new URL(await link.getAttribute('href'));
  expect(url.origin).toBe('https://revops.branddi.com');
  expect(url.pathname).toBe('/operacao/central-revops/helpdesk/novo');
  expect(url.searchParams.get('texto')).toContain('Verificar cargo do contato');
  expect(url.searchParams.get('texto')).not.toContain('relatório diverge');
  await page.getByRole('button', { name: 'Não é erro', exact: true }).click();
  await expect(page.getByText('1 a validar', { exact: true })).toBeVisible();
  await expect(page.locator('.review-list').getByText('A validar', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Relatórios e materiais', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Abrir material' })).toHaveAttribute(
    'href',
    'https://report.branddi.com/report/teste',
  );
  await expect(page.getByText('Link registrado · a verificar', { exact: true })).toBeVisible();
});
