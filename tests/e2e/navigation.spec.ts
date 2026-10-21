import { test, expect, type Page } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

/** Abre os grupos recolhidos do menu (ex.: "Configurar") antes de procurar o link. */
async function expandNavGroups(page: Page, scope: string) {
  const collapsed = page.locator(`${scope} nav button[aria-expanded="false"]`);
  while ((await collapsed.count()) > 0) {
    await collapsed.first().click();
  }
}

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
      await expandNavGroups(page, 'aside');
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
      await expandNavGroups(page, 'div[role="dialog"]');
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

test('busca global (Ctrl+K) abre a busca e navega para tela ao pressionar Enter', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Dashboard');

  // Abre com Ctrl+K
  await page.keyboard.press('Control+k');
  const dialog = page.locator('div[role="dialog"]');
  await expect(dialog).toBeVisible();

  // Digita "transa" e aperta Enter
  await page.keyboard.type('transa');
  await page.keyboard.press('Enter');

  // A URL passa a ser /transacoes
  await expect(page).toHaveURL('/transacoes');
  await expect(page.locator('h1')).toHaveText('Transações');
});
