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
async function fixture(page, { connected = true, failAnalysis = false } = {}) {
  const calls = [];
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
      case 'source':
        body = { source };
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
  await page.getByRole('button', { name: 'Nova extração', exact: true }).click();
  await expect(page.getByText('20 etapas preservadas', { exact: false })).toBeVisible();
  expect(calls.some((call) => call.action === 'answer')).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('pipedriveToken'))).toBeNull();
  await page.getByRole('button', { name: 'Gerar briefing', exact: true }).click();
  await expect(page.getByText('A reunião foi confirmada pelo cliente.')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir fonte', exact: false }).click();
  await expect(page.getByRole('dialog')).toContainText(source.text);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Dados e fontes', exact: true }).click();
  await page.getByRole('button', { name: 'Ver original', exact: true }).click();
  await expect(page.getByText('Resposta original do CRM')).toBeVisible();
  await page.screenshot({ path: 'test-results/crm-sources-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
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
  await expect(page.getByText('Qual foi o último compromisso?', { exact: true })).toBeVisible();
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
  await page.getByRole('button', { name: 'Nova extração' }).click();
  await expect(page.getByText('20 etapas preservadas', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Gerar briefing', exact: true }).click();
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
