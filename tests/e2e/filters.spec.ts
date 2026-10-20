import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';
import { waitForHydration } from './helpers/hydration';

// Cada filtro faz router.push e a página re-renderiza no servidor. Com o servidor de desenvolvimento
// carregado (suíte inteira em paralelo), isso passa dos 5 s padrão.
const NAV = { timeout: 15_000 };

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Filtros de transações e visão', () => {
  test('fluxo completo: selecionar instituição, mudar mês, aplicar filtro e remover chip', async ({ page }) => {
    await page.goto('/');

    const filterBar = page.locator('div[data-slot="filter-bar"]');
    await expect(filterBar).toBeVisible();

    // 1. Escolher "Nubank" no seletor de visão -> URL contém inst=
    const viewButton = page.locator('button[aria-label="Seletor de visão"]');
    await waitForHydration(viewButton);
    await viewButton.click();

    // Clica na opção "Todas do Nubank"
    const nubankOption = page.getByRole('option', { name: 'Todas do Nubank' });
    await expect(nubankOption).toBeVisible();
    await nubankOption.click();

    await expect(page).toHaveURL(/inst=/, NAV);
    await expect(viewButton).toContainText('Nubank');

    // Recarregar mantém a seleção
    await page.reload();
    await expect(page).toHaveURL(/inst=/);
    await expect(page.locator('button[aria-label="Seletor de visão"]')).toContainText('Nubank');

    // 2. Mudar o mês com a seta anterior atualiza o rótulo e URL.
    // Depois do reload o HTML do servidor aparece antes da hidratação: um clique nesse intervalo se perde.
    const prevMonthButton = page.locator('button[aria-label="Mês anterior"]');
    await waitForHydration(prevMonthButton);
    await prevMonthButton.click();
    await expect(page).toHaveURL(/mes=/, NAV);

    // 3. Adicionar filtro Pix em "+ Filtros" gera um chip
    const moreFiltersButton = page.locator('button[aria-label="Mais filtros"]');
    await moreFiltersButton.click();

    const pixOption = page.locator('label').filter({ hasText: 'Pix' });
    await expect(pixOption).toBeVisible();
    await pixOption.click();
    // Espera a navegação do filtro terminar antes de fechar o popover
    await expect(page).toHaveURL(/forma=pix/, NAV);
    await expect(page).toHaveURL(/mes=/);

    // Fecha o popover clicando fora / escape
    await page.keyboard.press('Escape');

    // Verifica que o chip "Pix" apareceu
    const activeChips = page.locator('div[data-slot="active-filter-chips"]');
    await expect(activeChips).toBeVisible();
    await expect(activeChips).toContainText('Pix');

    // 4. Clicar no ✕ remove o filtro
    const removePixBtn = page.locator('button[aria-label="Remover filtro Pix"]');
    await expect(removePixBtn).toBeVisible();
    await removePixBtn.click();

    await expect(page).not.toHaveURL(/forma=/, NAV);
    await expect(activeChips.getByText('Pix', { exact: true })).not.toBeVisible();
  });
});
