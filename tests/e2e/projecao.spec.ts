import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Projeção de fluxo de caixa (B4-03)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('abre /projecao, exibe cards de resumo, gráfico de trajetória com incerteza e tabela detalhada', async ({
    page,
  }) => {
    await page.goto('/projecao');

    // Header
    await expect(
      page.getByRole('heading', { name: 'Projeção de fluxo de caixa', level: 1 }),
    ).toBeVisible();

    // Cards de resumo
    await expect(page.getByText('Saldo Líquido Atual')).toBeVisible();
    await expect(page.getByText(/^Saldo Projetado/i)).toBeVisible();
    await expect(page.getByText('Menor Saldo Previsto')).toBeVisible();
    await expect(page.getByText('Variação no Semestre')).toBeVisible();

    // Gráfico de trajetória
    await expect(page.getByText(/Trajetória projetada para os próximos/i)).toBeVisible();
    await expect(page.getByText('Saldo esperado')).toBeVisible();
    await expect(page.getByText(/Faixa de incerteza/i).first()).toBeVisible();

    // Tabela detalhada
    await expect(page.getByText('Detalhamento mês a mês')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Mês' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Saldo Inicial' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '(+) Receitas' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '(-) Desp. Fixas' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '(-) Cartão / Parc.' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '(-) Variáveis (est.)' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '(=) Saldo Final' })).toBeVisible();

    // Linha de total
    await expect(page.getByText('Total do período')).toBeVisible();

    // Nota metodológica
    await expect(page.getByText('Como a projeção é calculada')).toBeVisible();
  });

  test('responsividade em tela mobile de 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/projecao');

    await expect(
      page.getByRole('heading', { name: 'Projeção de fluxo de caixa', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Saldo Líquido Atual')).toBeVisible();
    await expect(page.getByText(/Trajetória projetada/i)).toBeVisible();
    await expect(page.getByText('Detalhamento mês a mês')).toBeVisible();
  });
});
