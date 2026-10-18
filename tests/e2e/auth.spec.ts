import '../../scripts/load-env';
import { test, expect } from '@playwright/test';

test.describe('Autenticação', () => {
  test.skip(process.env.AUTH_DISABLED === 'true', 'Autenticação desabilitada no ambiente local');

  test('senha incorreta exibe erro', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="password"]', 'senha-errada');
    await page.click('button[type="submit"]');

    const alert = page.locator('role=alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Senha incorreta');
  });

  test('senha correta acessa o dashboard', async ({ page }) => {
    const password = process.env.TEST_APP_PASSWORD || 'senha-teste';
    await page.goto('/login');
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toBeVisible();
  });
});
