import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

const ALL = '/transacoes?de=2020-01-01&ate=2030-12-31';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

function rows(page: Page): Locator {
  return page.locator('li[data-tx-id]');
}

test.describe('Divisão de transação (B2-03b)', () => {
  test('abrir detalhe, dividir transação em duas partes, conferir na lista e desfazer', async ({ page }) => {
    // Busca uma transação de mercado ou drogaria para dividir
    await page.goto(`${ALL}&natureza=expense`);
    await expect(rows(page).first()).toBeVisible();

    const firstTxRow = rows(page).first();
    const originalText = await firstTxRow.innerText();
    expect(originalText).toBeTruthy();

    // Abre o painel lateral de detalhe
    const descBtn = firstTxRow.locator('button').first();
    await descBtn.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // Clica no botão Dividir transação
    const splitBtn = sheet.getByRole('button', { name: 'Dividir transação' });
    await expect(splitBtn).toBeVisible();
    await splitBtn.click();

    // Dialog de divisão deve estar visível
    const splitDialog = page.getByRole('dialog', { name: 'Dividir transação' });
    await expect(splitDialog).toBeVisible();

    // Inicialmente já divide ao meio e a soma confere
    await expect(splitDialog.getByText(/✓ Soma confere exatamente/)).toBeVisible();

    // Altera a descrição das duas partes para identificação única
    const uniqueTag = Math.random().toString(36).slice(2, 7);
    const descInputs = splitDialog.getByLabel('Descrição');
    await descInputs.nth(0).fill(`Divisão A ${uniqueTag}`);
    await descInputs.nth(1).fill(`Divisão B ${uniqueTag}`);

    // Confirma a divisão
    const confirmBtn = splitDialog.getByRole('button', { name: 'Confirmar divisão' });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Toast de sucesso
    await expect(page.getByText('Transação dividida com sucesso!')).toBeVisible();

    // Busca pelas transações divididas na listagem
    await page.getByRole('searchbox', { name: 'Buscar transações' }).fill(uniqueTag);
    await expect(page).toHaveURL(new RegExp(uniqueTag));
    await expect(page.getByText(`Divisão A ${uniqueTag}`)).toBeVisible();
    await expect(page.getByText(`Divisão B ${uniqueTag}`)).toBeVisible();

    // Abre a primeira transação filha para verificar aviso e desfazer
    await page.getByText(`Divisão A ${uniqueTag}`).click();
    await expect(page.getByText('Parte de divisão')).toBeVisible();
    await expect(page.getByText('Esta transação é resultado de uma divisão de')).toBeVisible();

    // Desfaz a divisão
    const undoBtn = page.getByRole('button', { name: 'Desfazer divisão inteira' });
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    await expect(page.getByText('Divisão desfeita com sucesso!')).toBeVisible();
  });
});
