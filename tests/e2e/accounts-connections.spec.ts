import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Telas de contas e conexões', () => {
  test('gerenciamento de contas: renomear e alternar incluir nos totais', async ({ page }) => {
    await page.goto('/contas');
    await expect(page.locator('h1')).toHaveText('Contas e cartões');

    // 1. Verifica seções de instituições pelos títulos
    await expect(page.getByRole('heading', { name: 'Nubank' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Itaú' })).toBeVisible();

    // 2. Abre menu de uma conta para renomear
    const moreBtn = page.locator('button[aria-label*="Opções da conta Nubank Conta"]').first();
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();

    await page.getByRole('menuitem', { name: 'Renomear' }).click();

    // Diálogo de renomear
    const input = page.locator('input#displayName');
    await expect(input).toBeVisible();
    await input.fill('Nubank Principal');
    await page.getByRole('button', { name: 'Salvar' }).click();

    // Verifica que atualizou na tela
    await expect(page.getByText('Nubank Principal')).toBeVisible();

    // 3. Testa alternar switch incluir nos totais
    const updatedMoreBtn = page.locator('button[aria-label*="Opções da conta Nubank Principal"]').first();
    await updatedMoreBtn.click();
    const switchEl = page.locator('div[role="menu"]').getByRole('switch');
    await expect(switchEl).toBeVisible();
    await switchEl.click();
    await expect(page.getByText(/Conta (removida|incluída) dos totais/)).toBeVisible();
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
