import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Dashboard', () => {
  // Em modo dev a primeira visita a cada rota compila a página; dá folga além dos 30 s padrão.
  test.describe.configure({ timeout: 120_000 });

  test('carrega com os dados fictícios e mostra os KPIs em R$', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Início' })).toBeVisible();

    // Passo de fumaça da estrutura de abas: clicar em "Visão geral" e ver o card "Gastos"
    await page.getByRole('link', { name: /Visão geral/i }).click();

    const gastos = page.getByTestId('kpi-gastos');
    await expect(gastos).toBeVisible();
    await expect(gastos).toContainText('R$');
    for (const id of ['kpi-receitas', 'kpi-saldo-do-periodo', 'kpi-saldo-em-contas', 'kpi-faturas-abertas', 'kpi-parcelas-futuras']) {
      await expect(page.getByTestId(id)).toContainText('R$');
    }

    await expect(page.getByText('Gastos por categoria')).toBeVisible();
    await expect(page.getByText('Gastos por forma de pagamento')).toBeVisible();
    await expect(page.getByText('Evolução mensal')).toBeVisible();
    await expect(page.getByText('Próximas faturas')).toBeVisible();
  });

  test('clicar numa fatia da rosca leva para /transacoes com cat= e o mesmo período', async ({ page }) => {
    await page.goto('/?mes=2026-09');
    // Seletor estável: cada fatia tem data-slice=<id da categoria>. O centro da caixa de uma fatia
    // grande cai no furo da rosca, por isso o clique é disparado no próprio elemento.
    const slice = page.locator('path[data-slice]').first();
    await expect(slice).toBeVisible();
    const id = await slice.getAttribute('data-slice');
    await slice.dispatchEvent('click');
    await expect(page).toHaveURL(new RegExp(`/transacoes\\?.*cat=${id}`));
    expect(page.url()).toContain('mes=2026-09');
  });

  test('legenda da rosca leva para /transacoes com cat= da categoria', async ({ page }) => {
    await page.goto('/?mes=2026-09');
    const legend = page.getByRole('list', { name: 'Legenda: gastos por categoria' });
    const first = legend.getByRole('link').first();
    const href = await first.getAttribute('href');
    expect(href).toMatch(/^\/transacoes\?.*cat=[0-9a-f-]{36}/);
    await first.click();
    await expect(page).toHaveURL(/\/transacoes\?.*cat=[0-9a-f-]{36}/);
    expect(page.url()).toContain('mes=2026-09');
  });

  test('barra de forma de pagamento leva para /transacoes com forma=', async ({ page }) => {
    await page.goto('/');
    const bars = page.getByRole('list', { name: 'Gastos por forma de pagamento' });
    await bars.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/transacoes\?.*forma=/);
  });

  test('legível em 390 px: os cards empilham sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('kpi-gastos')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const a = await page.getByTestId('kpi-gastos').boundingBox();
    const b = await page.getByTestId('kpi-receitas').boundingBox();
    expect(b!.y).toBeGreaterThan(a!.y);
  });
});
