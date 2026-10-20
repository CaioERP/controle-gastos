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

  test('cadastra nova posição manual e navega pela aba de proventos (B3-03)', async ({ page }) => {
    await page.goto('/investimentos');
    await expect(page.getByRole('heading', { name: 'Investimentos', level: 1 })).toBeVisible();

    // Abre modal de nova posição manual
    await page.getByRole('button', { name: 'Nova posição manual' }).click();
    await expect(page.getByRole('heading', { name: 'Nova posição manual de investimento' })).toBeVisible();

    // Preenche campos
    await page.getByLabel('Nome do ativo').fill('CDB Teste Manual');
    await page.getByLabel('Valor aplicado (R$)').fill('1000,00');
    await page.getByLabel('Valor bruto atual (R$)').fill('1000,00');

    // Salva
    await page.getByRole('button', { name: 'Salvar posição' }).click();

    // Verifica que a posição aparece na tabela
    await expect(page.getByText('CDB Teste Manual')).toBeVisible();

    // Clica na aba de proventos
    await page.getByRole('tab', { name: 'Proventos' }).click();
    await expect(page.getByText('Total em 12 meses')).toBeVisible();
    await expect(page.getByText('Evolução mensal de proventos recebidos')).toBeVisible();
    await expect(page.getByText('Extrato de proventos')).toBeVisible();
  });
});

