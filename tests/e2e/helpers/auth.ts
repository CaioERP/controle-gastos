import '../../../scripts/load-env';
import type { Page } from '@playwright/test';

/** Com autenticação ligada (AUTH_DISABLED=false), entra com TEST_APP_PASSWORD; senão, não faz nada. */
export async function loginIfNeeded(page: Page): Promise<void> {
  if (process.env.AUTH_DISABLED === 'true') return;
  const password = process.env.TEST_APP_PASSWORD;
  if (!password) throw new Error('Autenticação ligada: defina TEST_APP_PASSWORD para rodar o e2e');
  await page.goto('/login');
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
