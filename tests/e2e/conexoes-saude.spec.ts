import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Saúde das conexões (B2-02)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('abre /conexoes, navega para o detalhe da conexão e exibe status do consentimento, gráfico diário e histórico', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/conexoes');
    await expect(page.locator('h1')).toHaveText('Conexões');

    const detailLink = page.getByRole('link', { name: /Ver saúde e histórico/i }).first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();

    await expect(page).toHaveURL(/\/conexoes\/[0-9a-f-]{36}/);

    // Verifica que os elementos principais aparecem na tela
    await expect(page.getByTestId('card-consent')).toBeVisible();
    await expect(page.getByText('Status do consentimento')).toBeVisible();
    await expect(page.getByTestId('sync-daily-chart')).toBeVisible();
    await expect(page.getByTestId('sync-history')).toBeVisible();
  });
});
