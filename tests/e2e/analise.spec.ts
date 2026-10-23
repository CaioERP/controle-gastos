import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Análise', () => {
  // Em modo dev a primeira visita a cada rota compila a página; dá folga além dos 30 s padrão.
  test.describe.configure({ timeout: 120_000 });

  test('drill-down em Alimentação mostra as subcategorias e o caminho com volta', async ({ page }) => {
    await page.goto('/analise?mes=2026-09');
    const byCategory = page.getByRole('list', { name: 'Gastos por categoria' });
    await byCategory.getByRole('link', { name: /Alimentação/ }).click();

    await expect(page).toHaveURL(/\/analise\?.*cat=[0-9a-f-]{36}/);
    expect(page.url()).toContain('mes=2026-09');
    const crumbs = page.getByRole('navigation', { name: 'Caminho da categoria' });
    await expect(crumbs).toContainText('Alimentação');
    await expect(page.getByRole('list', { name: 'Gastos por categoria' })).toContainText(/Delivery|Mercado|Restaurante|Padaria/);

    // No detalhamento, a matriz também é por subcategoria: nenhuma célula aponta para o pai inteiro
    const parentId = new URL(page.url()).searchParams.get('cat')!;
    const cellHrefs = await page.getByTestId('crosstab').locator('a[data-cell]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('href') ?? '')
    );
    expect(cellHrefs.length).toBeGreaterThan(0);
    for (const href of cellHrefs) expect(new URLSearchParams(href.split('?')[1]).get('cat')).not.toBe(parentId);

    // Subcategoria abre as transações filtradas por ela
    const sub = page.getByRole('list', { name: 'Gastos por categoria' }).getByRole('link').first();
    await expect(sub).toHaveAttribute('href', /\/transacoes\?.*cat=/);

    // "Todas" volta para as categorias pai
    await crumbs.getByRole('link', { name: 'Todas' }).click();
    await expect(page).not.toHaveURL(/cat=/);
    await expect(page.getByRole('list', { name: 'Gastos por categoria' })).toContainText('Alimentação');
  });

  test('clicar numa célula da matriz abre transações filtradas pelas duas dimensões', async ({ page }) => {
    await page.goto('/analise?mes=2026-09');
    const cell = page.getByTestId('crosstab').locator('a[data-cell]').first();
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(page).toHaveURL(/\/transacoes\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('cat')).toMatch(/^[0-9a-f-]{36}$/);
    expect(url.searchParams.get('forma')).toBeTruthy();
    expect(url.searchParams.get('mes')).toBe('2026-09');
  });

  test('seletor de dimensão da evolução vai para a URL', async ({ page }) => {
    await page.goto('/analise');
    const nav = page.getByRole('navigation', { name: 'Dimensão da evolução' });
    await nav.getByRole('link', { name: 'Forma de pagamento' }).click();
    await expect(page).toHaveURL(/dim=paymentMethod/);
    await expect(nav.getByRole('link', { name: 'Forma de pagamento' })).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Linhas' }).click();
    await expect(page.getByRole('button', { name: 'Linhas' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('em 390 px a página não rola na horizontal (matriz vira lista)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/analise');
    await expect(page.getByTestId('crosstab-mobile')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
