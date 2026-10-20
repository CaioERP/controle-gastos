import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Investimentos (B3-01)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('abre /investimentos, exibe cards de resumo, gráfico de alocação e tabela de posições', async ({ page }) => {
    await page.goto('/investimentos');
    await expect(page.getByRole('heading', { name: 'Investimentos', level: 1 })).toBeVisible();

    // Cards de resumo
    await expect(page.getByText('Patrimônio investido')).toBeVisible();
    await expect(page.getByText('Rentabilidade bruta')).toBeVisible();
    await expect(page.getByText('Desempenho 12 meses (TWR)')).toBeVisible();
    await expect(page.getByText('Proventos (12 meses)')).toBeVisible();

    // Gráficos
    await expect(page.getByText('Alocação por classe')).toBeVisible();
    await expect(page.getByText('Rentabilidade acumulada vs Índices (12 meses)')).toBeVisible();

    // Tabela de posições
    await expect(page.getByText('Posições ativas')).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();

    // Botão de atualizar cotações
    await expect(page.getByRole('button', { name: 'Atualizar cotações' })).toBeVisible();
  });
});
