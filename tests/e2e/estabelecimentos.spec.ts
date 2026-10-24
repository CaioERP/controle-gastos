import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Histórico por estabelecimento (B6-20)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('lista estabelecimentos, busca e navega para o detalhe com métricas e histórico', async ({ page }) => {
    // 1. Abre a listagem de estabelecimentos
    await page.goto('/estabelecimentos');
    await expect(page.getByRole('heading', { name: 'Estabelecimentos' })).toBeVisible();

    // 2. Verifica busca
    const searchInput = page.getByLabel('Buscar estabelecimento');
    await expect(searchInput).toBeVisible();

    // Espera lista carregar com itens dentro do main
    const main = page.getByRole('main');
    const items = main.getByRole('listitem').getByRole('link');
    await expect(items.first()).toBeVisible();

    // 3. Clica no primeiro estabelecimento da lista
    await items.first().click();

    // 4. Checa página de detalhe
    await expect(page).toHaveURL(/\/estabelecimentos\/[0-9a-f-]+/);
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    const merchantName = await heading.textContent();
    expect(merchantName?.trim().length).toBeGreaterThan(0);

    // StatStrip
    await expect(page.getByText('Gasto em 12 meses')).toBeVisible();
    await expect(page.getByText('Ticket médio')).toBeVisible();
    await expect(page.getByText('Última compra')).toBeVisible();

    // Seções
    await expect(page.getByText('Gasto por mês')).toBeVisible();
    await expect(page.getByText('Como você paga ali')).toBeVisible();
    await expect(page.getByText('Histórico de transações')).toBeVisible();

    // 5. Ação "Ver no extrato"
    const viewStatement = page.getByRole('link', { name: 'Ver no extrato' });
    await expect(viewStatement).toBeVisible();
    await viewStatement.click();

    // Checa navegação para /transacoes com filtro estab
    await expect(page).toHaveURL(/\/transacoes\?estab=/);
    await expect(page.getByRole('heading', { name: 'Transações' })).toBeVisible();
  });
});
