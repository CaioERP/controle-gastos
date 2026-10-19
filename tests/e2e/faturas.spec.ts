import { test, expect, type Page } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

/** "R$ 1.234,56" → 123456 */
function parseCents(text: string): number {
  const digits = text.replace(/[^\d-]/g, '');
  return Number(digits);
}

async function expectItemsSumMatchesTotal(page: Page) {
  const total = parseCents(await page.getByTestId('invoice-total').innerText());
  const sum = parseCents(await page.getByTestId('invoice-items-sum').innerText());
  expect(sum).toBe(total);
}

test.describe('Tela de faturas', () => {
  test('abre a fatura aberta do primeiro cartão com a soma dos itens igual ao total', async ({ page }) => {
    await page.goto('/faturas');
    await expect(page.locator('h1')).toHaveText('Faturas');
    await expect(page.locator('[data-testid="invoice-chip"][aria-current="true"]')).toContainText('Aberta');
    await expect(page.getByTestId('invoice-item').first()).toBeVisible();
    await expectItemsSumMatchesTotal(page);
    await expect(page.getByTestId('committed-text')).toContainText('já comprometidos nos próximos 12 meses');
  });

  test('trocar de cartão muda a URL e a lista', async ({ page }) => {
    await page.goto('/faturas');
    const nav = page.getByRole('navigation', { name: 'Cartões' });
    const firstItems = await page.getByTestId('invoice-item').allInnerTexts();

    await nav.getByRole('link', { name: 'Nubank' }).click();
    await expect(page).toHaveURL(/cartao=/);
    await expect(nav.getByRole('link', { name: 'Nubank' })).toHaveAttribute('aria-current', 'page');
    await expect.poll(async () => (await page.getByTestId('invoice-item').allInnerTexts()).join('|')).not.toBe(
      firstItems.join('|'),
    );
    await expectItemsSumMatchesTotal(page);
  });

  test('clicar numa fatura futura mostra só itens previstos', async ({ page }) => {
    await page.goto('/faturas');
    const nav = page.getByRole('navigation', { name: 'Cartões' });
    const hrefs = await nav.getByRole('link').evaluateAll((els) => els.map((el) => el.getAttribute('href')!));
    let found = false;
    for (const href of hrefs) {
      if (found) break;
      await page.goto(href);
      await expect(page.getByTestId('invoice-chip').first()).toBeVisible();
      const forecast = page.locator('[data-testid="invoice-chip"][data-forecast="true"]');
      if ((await forecast.count()) === 0) continue;
      found = true;
      await expect(forecast.last()).toContainText('prevista');
      await forecast.last().click();
      await expect(page).toHaveURL(/fatura=\d{4}-\d{2}/);
      await expect(page.locator('[data-testid="invoice-chip"][aria-current="true"]')).toHaveAttribute(
        'data-forecast',
        'true',
      );
      const statuses = await page.getByTestId('invoice-item').evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-status')),
      );
      expect(statuses.length).toBeGreaterThan(0);
      expect(new Set(statuses)).toEqual(new Set(['projected']));
      await expectItemsSumMatchesTotal(page);
    }
    expect(found).toBe(true);
  });

  test('funciona em 390 px: select de cartão e sem rolagem horizontal da página', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/faturas');
    const select = page.getByLabel('Cartão', { exact: true });
    await expect(select).toBeVisible();
    const options = await select.locator('option').allTextContents();
    const nubank = options.find((o) => o.startsWith('Nubank'))!;
    await select.selectOption({ label: nubank });
    await expect(page).toHaveURL(/cartao=/);
    await expect(page.getByTestId('invoice-item').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
