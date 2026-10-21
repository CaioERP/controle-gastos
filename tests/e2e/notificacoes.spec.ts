import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Central de notificações e preferências de alerta (B4-05)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('abre popover de notificações, interage com preferências e navega para /notificacoes', async ({ page }) => {
    await page.goto('/');

    // Confere se o sino de notificações está visível no cabeçalho/sidebar
    const bellBtn = page.getByTestId('notification-bell-btn').first();
    await expect(bellBtn).toBeVisible();

    // Clica no sino para abrir o popover
    await bellBtn.click();
    await expect(page.getByTestId('notifications-popover-content')).toBeVisible();

    // Confere atalho para preferências no popover
    const openPrefsBtn = page.getByTestId('open-prefs-btn');
    await expect(openPrefsBtn).toBeVisible();
    await openPrefsBtn.click();

    // Confere se o modal de preferências abriu
    await expect(page.getByRole('heading', { name: 'Preferências de Alerta' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // Navega para a página completa /notificacoes
    await page.goto('/notificacoes');
    await expect(page.getByRole('heading', { name: 'Notificações', level: 1 })).toBeVisible();

    // Confere abas Todas e Não lidas
    await expect(page.getByRole('button', { name: /Todas/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Não lidas', exact: true })).toBeVisible();

    // Botão de preferências na página
    const pagePrefsBtn = page.getByTestId('open-prefs-page-btn');
    await expect(pagePrefsBtn).toBeVisible();
  });
});
