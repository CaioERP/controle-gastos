import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

const routes = [
  { href: '/', title: 'Dashboard' },
  { href: '/transacoes', title: 'Transações' },
  { href: '/analise', title: 'Análise' },
  { href: '/contas', title: 'Contas e cartões' },
  { href: '/faturas', title: 'Faturas' },
  { href: '/revisao', title: 'Revisão' },
  { href: '/categorias', title: 'Categorias e regras' },
  { href: '/conexoes', title: 'Conexões' },
];

test.describe('Navegação Desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('abre dashboard e navega por todas as rotas pelo menu lateral', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Dashboard');

    for (const route of routes.slice(1)) {
      await page.click(`aside a[href="${route.href}"]`);
      await expect(page).toHaveURL(route.href);
      await expect(page.locator('h1')).toHaveText(route.title);
    }
  });
});

test.describe('Navegação Mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('abre menu deslizante e navega pelas rotas sem overflow horizontal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Dashboard');

    // Verifica que não há rolagem horizontal
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Navega pelo menu mobile
    for (const route of routes.slice(1)) {
      await page.click('button[aria-label="Abrir menu de navegação"]');
      await page.click(`div[role="dialog"] a[href="${route.href}"]`);
      await expect(page).toHaveURL(route.href);
      await expect(page.locator('h1')).toHaveText(route.title);
    }
  });
});

test('aplica a fonte Geist (e não a fonte padrão do navegador)', async ({ page }) => {
  await page.goto('/');
  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(fontFamily).toContain('Geist');
});
