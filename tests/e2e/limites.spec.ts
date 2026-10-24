import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Limites e orçamentos (B4-01)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('abre /limites, exibe cards de resumo, navegação e abre diálogo de nova meta', async ({ page }) => {
    await page.goto('/limites');
    await expect(page.getByRole('heading', { name: 'Limites e metas', level: 1 })).toBeVisible();

    // Cards de resumo
    await expect(page.getByTestId('kpi-total-orcado')).toBeVisible();
    await expect(page.getByTestId('kpi-total-gasto')).toBeVisible();
    await expect(page.getByTestId('kpi-limites-alerta')).toBeVisible();
    await expect(page.getByTestId('kpi-limites-ultrapassados')).toBeVisible();

    // Botão nova meta e abertura do diálogo
    const newBtn = page.getByTestId('new-limit-btn');
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    await expect(page.getByRole('heading', { name: 'Nova Meta de Gastos' })).toBeVisible();
    await expect(page.getByLabel(/Nome da meta/i)).toBeVisible();
    await expect(page.getByLabel(/Valor limite/i)).toBeVisible();

    // Fecha o diálogo clicando em Cancelar
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Nova Meta de Gastos' })).not.toBeVisible();

    // Acessa o dashboard e confere o widget de limites
    await page.goto('/?aba=geral');
    await expect(page.getByText('Metas do mês').filter({ visible: true })).toBeVisible();
  });
});
