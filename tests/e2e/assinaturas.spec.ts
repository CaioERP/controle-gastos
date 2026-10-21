import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Assinaturas e recorrências (B4-02)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('abre /assinaturas, exibe cards de resumo, filtros e abre diálogo de nova recorrência', async ({ page }) => {
    await page.goto('/assinaturas');
    await expect(page.getByRole('heading', { name: 'Assinaturas e recorrências', level: 1 })).toBeVisible();

    // Cards de resumo
    await expect(page.getByTestId('kpi-mensal-fixo')).toBeVisible();
    await expect(page.getByTestId('kpi-anual-estimado')).toBeVisible();
    await expect(page.getByTestId('kpi-assinaturas-ativas')).toBeVisible();
    await expect(page.getByTestId('kpi-aumentos-recentes')).toBeVisible();

    // Botão de nova recorrência e abertura do diálogo
    const newBtn = page.getByTestId('new-recurrence-btn');
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    await expect(page.getByRole('heading', { name: /Nova Assinatura \/ Recorrência/i })).toBeVisible();
    await expect(page.getByLabel(/Descrição \/ Serviço/i)).toBeVisible();
    await expect(page.getByLabel(/^Valor/i)).toBeVisible();

    // Fecha o modal clicando em Cancelar
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: /Nova Assinatura \/ Recorrência/i })).not.toBeVisible();
  });
});
