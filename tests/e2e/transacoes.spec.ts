import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

// Período largo e explícito: os testes não dependem da data real nem do mês corrente.
const ALL = '/transacoes?de=2020-01-01&ate=2030-12-31';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

function rows(page: Page): Locator {
  return page.locator('li[data-tx-id]');
}

function rowById(page: Page, id: string): Locator {
  return page.locator(`li[data-tx-id="${id}"]`);
}

async function firstRowWith(page: Page, text: string): Promise<{ row: Locator; id: string }> {
  const row = rows(page).filter({ hasText: text }).first();
  await expect(row).toBeVisible();
  const id = (await row.getAttribute('data-tx-id'))!;
  return { row: rowById(page, id), id };
}

test.describe('Tela de transações', () => {
  test('buscar "uber" filtra a lista e grava q na URL', async ({ page }) => {
    await page.goto(ALL);
    await expect(page.locator('h1')).toHaveText('Transações');
    await expect(rows(page).filter({ hasText: 'Netflix' }).first()).toBeVisible();

    await page.getByRole('searchbox', { name: 'Buscar transações' }).fill('uber');
    await expect(page).toHaveURL(/[?&]q=uber/);
    await expect(rows(page).filter({ hasText: 'Netflix' })).toHaveCount(0);

    const count = await rows(page).count();
    expect(count).toBeGreaterThan(0);
    for (const text of await rows(page).allInnerTexts()) {
      expect(text.toLowerCase()).toContain('uber');
    }
  });

  test('trocar a categoria com "Todas de Uber" mostra toast, atualiza o badge e persiste', async ({ page }) => {
    await page.goto(`${ALL}&q=uber`);
    const { row, id } = await firstRowWith(page, 'Uber');

    await row.getByRole('button', { name: /Alterar categoria/ }).click();
    const search = page.getByPlaceholder('Buscar categoria...');
    await search.fill('Delivery');
    await page.getByRole('option', { name: 'Delivery' }).click();

    await page.getByRole('button', { name: /Todas de Uber/ }).click();
    await expect(page.getByText(/Categoria atualizada em \d+ transaç/)).toBeVisible();
    await expect(row.getByRole('button', { name: 'Alterar categoria (atual: Delivery)' })).toBeVisible();

    await page.reload();
    await expect(rowById(page, id).getByRole('button', { name: 'Alterar categoria (atual: Delivery)' })).toBeVisible();
  });

  test('seletor de categoria só oferece a natureza compatível', async ({ page }) => {
    // Receita: só categorias de receita
    await page.goto(`${ALL}&q=sal%C3%A1rio`);
    const { row } = await firstRowWith(page, 'Salário');
    await row.getByRole('button', { name: /Alterar categoria/ }).click();
    await expect(page.getByRole('option', { name: 'Rendimentos' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Delivery' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Transferência: sem seletor, só o badge da natureza
    await page.goto(`${ALL}&natureza=transfer`);
    const transfer = rows(page).first();
    await expect(transfer).toBeVisible();
    await expect(transfer.getByText('Transferência', { exact: true })).toBeVisible();
    await expect(transfer.getByRole('button', { name: /Alterar categoria/ })).toHaveCount(0);
  });

  test('sugestão automática aparece com a confiança', async ({ page }) => {
    await page.goto(`${ALL}&revisao=1`);
    await expect(page.getByRole('img', { name: /^Sugestão automática \(\d+%\)$/ }).first()).toBeVisible();
  });

  test('editar observações no detalhe persiste após recarregar', async ({ page }) => {
    await page.goto(`${ALL}&q=netflix`);
    const { row, id } = await firstRowWith(page, 'Netflix');
    const note = `Nota e2e ${Math.random().toString(36).slice(2, 8)}`;

    await row.getByRole('button', { name: 'Netflix' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('Campos que você editar não serão sobrescritos pela sincronização.')).toBeVisible();
    await expect(sheet.getByText('NETFLIX', { exact: false }).first()).toBeVisible();
    await sheet.getByLabel('Observações').fill(note);
    await sheet.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Transação atualizada')).toBeVisible();
    await expect(sheet).toBeHidden();

    await page.reload();
    await rowById(page, id).getByRole('button', { name: 'Netflix' }).click();
    await expect(page.getByRole('dialog').getByLabel('Observações')).toHaveValue(note);
  });

  test('criar e aplicar uma tag pelo detalhe persiste após recarregar', async ({ page }) => {
    await page.goto(`${ALL}&q=spotify`);
    const { row, id } = await firstRowWith(page, 'Spotify');
    const tag = `e2e-${Math.random().toString(36).slice(2, 7)}`;

    await row.getByRole('button', { name: 'Spotify' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Adicionar tag' }).click();
    await page.getByPlaceholder('Buscar ou criar tag...').fill(tag);
    await page.getByRole('option', { name: `Criar tag “${tag}”` }).click();
    await expect(page.getByText(`Tag “${tag}” criada`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet.getByRole('button', { name: `Remover tag ${tag}` })).toBeVisible();
    await sheet.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Transação atualizada')).toBeVisible();
    await expect(rowById(page, id)).toContainText(tag);

    await page.reload();
    await expect(rowById(page, id)).toContainText(tag);
  });

  test('"Carregar mais" traz a próxima página', async ({ page }) => {
    await page.goto(ALL);
    await expect(page.getByText('Mostrando 100 transações')).toBeVisible();
    await page.getByRole('button', { name: 'Carregar mais' }).click();
    await expect(page.getByText(/Mostrando (1\d\d|200) transações/)).toBeVisible();
    await expect(page.getByText('Mostrando 100 transações')).toHaveCount(0);
  });

  test('funciona em 390 px sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ALL);
    await expect(rows(page).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
