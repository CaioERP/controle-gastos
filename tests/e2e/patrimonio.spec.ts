import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Patrimônio líquido (B3-02)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('abre /patrimonio, exibe card de patrimônio líquido, gráfico de evolução e decomposição', async ({ page }) => {
    await page.goto('/patrimonio');
    await expect(page.getByRole('heading', { name: 'Patrimônio líquido', level: 1 })).toBeVisible();

    // Cards de resumo
    await expect(page.getByText('Patrimônio líquido', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Total de ativos', { exact: true })).toBeVisible();
    await expect(page.getByText('Total de compromissos (dívidas)')).toBeVisible();
    await expect(page.getByText('Variação no mês / no ano')).toBeVisible();

    // Gráfico de evolução
    await expect(page.getByText('Evolução do patrimônio')).toBeVisible();

    // Decomposição de Ativos vs Passivos e por Instituição
    await expect(page.getByText('Composição de Ativos vs Passivos')).toBeVisible();
    await expect(page.getByText('Patrimônio por Instituição')).toBeVisible();

    // Botão de registrar snapshot
    await expect(page.getByRole('button', { name: 'Registrar snapshot de hoje' })).toBeVisible();
  });
});
