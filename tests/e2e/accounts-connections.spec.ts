import { test, expect, type Page } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

// Nome da conta nos dados fictícios (tests/fixtures/generate.ts) e apelido usado no teste
const ORIGINAL_NAME = 'Nubank Conta';
const RENAMED = 'Nubank Principal';

const optionsButton = (page: Page, name: string) =>
  page.locator(`button[aria-label="Opções da conta ${name}"]`).first();

/**
 * Devolve a conta ao estado dos dados fictícios (sem apelido e incluída nos totais),
 * para o teste poder rodar várias vezes sem `npm run db:reset`.
 */
async function restoreAccount(page: Page): Promise<void> {
  await page.goto('/contas');
  await expect(page.locator('h1')).toHaveText('Contas e cartões');

  const renamedBtn = optionsButton(page, RENAMED);
  if ((await renamedBtn.count()) > 0) {
    await renamedBtn.click();
    await page.getByRole('menuitem', { name: 'Renomear' }).click();
    const input = page.locator('input#displayName');
    await expect(input).toBeVisible();
    // Apelido vazio restaura o nome original
    await input.fill('');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(input).toBeHidden();
  }

  const originalBtn = optionsButton(page, ORIGINAL_NAME);
  await expect(originalBtn).toBeVisible();
  await originalBtn.click();
  const switchEl = page.locator('div[role="menu"]').getByRole('switch');
  await expect(switchEl).toBeVisible();
  if (!(await switchEl.isChecked())) {
    await switchEl.click();
    await expect(page.getByText('Conta incluída nos totais')).toBeVisible();
    await expect(switchEl).toBeChecked();
  }
  await page.keyboard.press('Escape');
}

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Telas de contas e conexões', () => {
  test.describe('gerenciamento de contas', () => {
    test.beforeEach(async ({ page }) => {
      await restoreAccount(page);
    });

    // Roda mesmo se o teste falhar no meio, para não deixar o banco alterado
    test.afterEach(async ({ page }) => {
      await restoreAccount(page);
    });

    test('renomear e alternar incluir nos totais', async ({ page }) => {
      await page.goto('/contas');
      await expect(page.locator('h1')).toHaveText('Contas e cartões');

      // 1. Verifica seções de contas e presença das instituições
      await expect(page.getByRole('heading', { name: 'Contas', exact: true })).toBeVisible();
      await expect(page.getByText('Nubank').first()).toBeVisible();
      await expect(page.getByText('Itaú').first()).toBeVisible();

      // 2. Abre menu da conta para renomear
      const moreBtn = optionsButton(page, ORIGINAL_NAME);
      await expect(moreBtn).toBeVisible();
      await moreBtn.click();

      await page.getByRole('menuitem', { name: 'Renomear' }).click();

      // Diálogo de renomear
      const input = page.locator('input#displayName');
      await expect(input).toBeVisible();
      await input.fill(RENAMED);
      await page.getByRole('button', { name: 'Salvar' }).click();

      // Verifica que atualizou na tela
      await expect(page.getByText(RENAMED)).toBeVisible();

      // 3. Testa alternar o switch "incluir nos totais" (o afterEach religa)
      const updatedMoreBtn = optionsButton(page, RENAMED);
      await updatedMoreBtn.click();
      const switchEl = page.locator('div[role="menu"]').getByRole('switch');
      await expect(switchEl).toBeChecked();
      await switchEl.click();
      await expect(page.getByText('Conta removida dos totais')).toBeVisible();
      await expect(switchEl).not.toBeChecked();
    });
  });

  test('tela de conexões: exibe cabeçalho, botão de conexão e feedback', async ({ page }) => {
    await page.goto('/conexoes');
    await expect(page.locator('h1')).toHaveText('Conexões');

    // 1. Verifica que a área de conexão está presente
    await expect(page.getByText('MeuPluggy')).toBeVisible();

    // 2. Clica em conectar nova conta e recebe feedback amigável
    const connectBtn = page.getByRole('button', { name: 'Conectar nova conta' });
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();
    await expect(
      page.getByText(/A sincronização direta via Open Finance estará disponível em breve/)
    ).toBeVisible();
  });
});
