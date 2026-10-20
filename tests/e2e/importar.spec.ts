import { test, expect } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

test.describe('Importar arquivos (B2-01)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('abre /importar, envia CSV do Nubank, pré-visualiza item como Nova e confirma importação', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/importar');
    await expect(page.locator('h1')).toHaveText('Importar arquivos');

    const accountSelect = page.locator('select#import-account-select');
    await expect(accountSelect).toBeVisible();

    const uniqueDesc = `Pix Padaria E2E ${Date.now()}`;
    const csvContent = [
      'Data,Valor,Identificador,Descrição',
      `10/10/2026,-28.90,66100111-2222-4333-8444-555566667799,${uniqueDesc}`,
    ].join('\n');

    const fileInput = page.getByTestId('import-file-input');
    await fileInput.setInputFiles({
      name: 'nubank-conta-exemplo.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf-8'),
    });

    // Verifica que o card de pré-visualização abriu com o item marcado como "Nova"
    const previewCard = page.getByTestId('import-preview-card');
    await expect(previewCard).toBeVisible();
    await expect(previewCard.getByText('nubank-conta-exemplo.csv')).toBeVisible();
    await expect(previewCard.getByText('Nova', { exact: true }).first()).toBeVisible();

    // Confirma a importação e verifica o toast de sucesso
    await previewCard.getByRole('button', { name: 'Confirmar importação' }).click();
    await expect(page.getByText(/Importação concluída: 1 criada/i)).toBeVisible();
  });
});
