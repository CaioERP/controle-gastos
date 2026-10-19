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
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

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
    await expect(page.locator('.recharts-pie-sector path').first()).toBeVisible();
    // O centro da caixa de uma fatia grande cai no furo da rosca; clica num ponto do anel:
    // a 1ª fatia (a maior) começa em 0° (3 horas) e cresce no sentido anti-horário.
    const svg = await page.locator('[data-slot="chart"] svg.recharts-surface').first().boundingBox();
    const r = (svg!.width / 2) * 0.8;
    const angle = (8 * Math.PI) / 180;
    await page.mouse.click(svg!.x + svg!.width / 2 + r * Math.cos(angle), svg!.y + svg!.height / 2 - r * Math.sin(angle));
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
