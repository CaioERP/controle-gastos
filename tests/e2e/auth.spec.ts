// Para rodar: AUTH_DISABLED=false no .env.local, APP_PASSWORD_HASH gerado com
// `npx tsx scripts/hash-password.ts "<senha>"` e TEST_APP_PASSWORD=<senha> no ambiente.
import '../../scripts/load-env';
import { test, expect } from '@playwright/test';

test.describe('Autenticação', () => {
  test.skip(process.env.AUTH_DISABLED === 'true', 'Autenticação desabilitada no ambiente local');

  test('senha incorreta exibe erro', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="password"]', 'senha-errada');
    await page.click('button[type="submit"]');

    // 'form' evita pegar o anunciador de rotas do Next, que também tem role=alert
    const alert = page.locator('form [role="alert"]');
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
