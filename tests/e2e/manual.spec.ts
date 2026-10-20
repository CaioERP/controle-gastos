import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Lançamento manual (B2-03a)', () => {
  test('cria conta manual e lança despesa que aparece na lista de transações', async ({ page }) => {
    // 1. Criar conta manual em /contas
    await page.goto('/contas');
    await expect(page.locator('h1')).toHaveText('Contas e cartões');

    const newAccBtn = page.getByRole('button', { name: 'Nova conta manual' });
    await expect(newAccBtn).toBeVisible();
    await newAccBtn.click();

    await expect(page.getByRole('heading', { name: 'Nova conta manual' })).toBeVisible();

    const nameInput = page.locator('input#manual-acc-name');
    await nameInput.fill('Carteira teste');

    const balanceInput = page.locator('input#manual-acc-balance');
    await balanceInput.fill('100,00');

    await page.getByRole('button', { name: 'Criar conta' }).click();

    // Aguarda diálogo fechar e confirma criação da conta na tela
    await expect(page.getByText('Carteira teste')).toBeVisible();

    // 2. Lançar despesa em /transacoes
    await page.goto('/transacoes');
    await expect(page.locator('h1')).toHaveText('Transações');

    const newTxBtn = page.getByRole('button', { name: 'Novo lançamento' });
    await expect(newTxBtn).toBeVisible();
    await newTxBtn.click();

    await expect(page.getByRole('heading', { name: 'Novo lançamento manual' })).toBeVisible();

    // Preenche valor 12,34
    await page.locator('input#tx-amount').fill('12,34');

    // Preenche descrição
    await page.locator('input#tx-desc').fill('Lanche Carteira Teste');

    // Salva o lançamento
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();

    // 3. Confere que a transação aparece na lista
    await expect(page.getByText('Lanche Carteira Teste')).toBeVisible();
    await expect(page.getByText('12,34').first()).toBeVisible();
  });
});