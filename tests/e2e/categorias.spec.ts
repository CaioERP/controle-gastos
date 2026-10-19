import { test, expect, type Page } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

// Nomes únicos por execução: os testes alteram dados e não dependem de db:reset nem da ordem
const stamp = Date.now().toString(36);

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

function root(page: Page, name: string) {
  return page.locator(`[data-testid="category-root"][data-name="${name}"]`);
}

async function openRowMenu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name: `Ações de ${name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

test.describe('Tela de categorias, regras e estabelecimentos', () => {
  test('criar subcategoria em Alimentação: aparece na árvore e no filtro de transações; arquivar e restaurar', async ({
    page,
  }) => {
    const name = `Café ${stamp}`;
    await page.goto('/categorias');
    await expect(page.locator('h1')).toHaveText('Categorias e regras');

    await openRowMenu(page, 'Alimentação', 'Nova subcategoria');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Nova subcategoria em Alimentação');
    await dialog.getByLabel('Nome').fill(name);
    await dialog.getByRole('radio', { name: 'coffee' }).click();
    await dialog.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByText('Categoria criada')).toBeVisible();
    const child = root(page, 'Alimentação').locator(`[data-testid="category-child"][data-name="${name}"]`);
    await expect(child).toBeVisible();

    // Seletor de categoria da tela de transações (filtros)
    await page.goto('/transacoes');
    await page.getByRole('button', { name: 'Mais filtros' }).click();
    const option = page.getByRole('dialog').getByText(name, { exact: true });
    await option.scrollIntoViewIfNeeded();
    await expect(option).toBeVisible();

    // Arquivar pede confirmação no diálogo e manda para o bloco de arquivadas
    await page.goto('/categorias');
    await openRowMenu(page, name, 'Arquivar');
    await expect(page.getByRole('dialog').getByText('Nenhuma transação usa esta categoria.')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Arquivar' }).click();
    await expect(page.getByText(`Categoria "${name}" arquivada`)).toBeVisible();
    await expect(child).toHaveCount(0);

    await page.getByText(/Arquivadas \(\d+\)/).click();
    const archived = page.locator(`[data-testid="category-archived"][data-name="${name}"]`);
    await archived.getByRole('button', { name: 'Restaurar' }).click();
    await expect(page.getByText(`Categoria "${name}" restaurada`)).toBeVisible();
    await expect(child).toBeVisible();
  });

  test('erro do comando vira toast e a natureza não muda na edição', async ({ page }) => {
    await page.goto('/categorias');
    await page.locator('[aria-label="Despesas"]').getByRole('button', { name: 'Nova categoria' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nome').fill('Alimentação');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Já existe uma categoria com esse nome')).toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await openRowMenu(page, 'Salário', 'Editar');
    await expect(page.getByRole('dialog').getByRole('radio', { name: 'Receita' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('dialog').getByRole('radio', { name: 'Despesa' })).toBeDisabled();
  });

  test('criar regra "Descrição contém uber" mostra a contagem; regex inválida vira toast; excluir confirma no diálogo', async ({
    page,
  }) => {
    const pattern = `uber ${stamp}`;
    await page.goto('/categorias?aba=regras');
    await page.getByRole('button', { name: 'Nova regra' }).click();
    const dialog = page.getByRole('dialog');

    // Erro de validação do comando (regex inválida) aparece no toast
    await dialog.getByLabel('Comparação').selectOption('regex');
    await dialog.getByLabel('Texto').fill('(');
    await dialog.getByLabel('Categoria').selectOption({ label: 'Transporte › App de transporte' });
    await dialog.getByRole('button', { name: 'Salvar regra' }).click();
    await expect(page.getByText('Expressão regular inválida no padrão da regra')).toBeVisible();

    await dialog.getByLabel('Comparação').selectOption('contains');
    await dialog.getByLabel('Texto').fill(pattern);
    await dialog.getByRole('button', { name: 'Salvar regra' }).click();
    await expect(page.getByText(/Regra salva · \d+ transaç(ão|ões) recategorizadas?/)).toBeVisible();

    const row = page.getByTestId('rule-row').filter({ hasText: pattern });
    await expect(row).toContainText('Descrição contém');
    await expect(row).toContainText('App de transporte');
    await expect(row).toContainText('Manual');

    await row.getByRole('switch').click();
    await expect(page.getByText('Regra desativada')).toBeVisible();

    await row.getByRole('button', { name: `Editar regra ${pattern}` }).click();
    await dialog.getByRole('button', { name: 'Excluir' }).click();
    await expect(dialog.getByRole('heading')).toHaveText('Excluir esta regra?');
    await dialog.getByRole('button', { name: 'Confirmar exclusão' }).click();
    await expect(page.getByText('Regra excluída')).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test('estabelecimentos: busca na URL e edição do nome de exibição', async ({ page }) => {
    await page.goto('/categorias?aba=estabelecimentos');
    await page.getByLabel('Buscar estabelecimento').fill('ifood');
    await expect(page).toHaveURL(/q=ifood/);
    const row = page.getByTestId('merchant-row');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('iFood');

    const renamed = `iFood ${stamp}`;
    await row.getByRole('button', { name: 'Editar iFood' }).click();
    await page.getByRole('dialog').getByLabel('Nome de exibição').fill(renamed);
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Estabelecimento atualizado')).toBeVisible();
    await expect(row).toContainText(renamed);

    // Volta ao nome original para não afetar outros testes
    await row.getByRole('button', { name: `Editar ${renamed}` }).click();
    await page.getByRole('dialog').getByLabel('Nome de exibição').fill('iFood');
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Editar iFood', exact: true })).toBeVisible();
  });

  test('funciona em 390 px nas três abas, sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const aba of ['categorias', 'regras', 'estabelecimentos']) {
      await page.goto(`/categorias?aba=${aba}`);
      const tabs = page.getByRole('navigation', { name: 'Seções' });
      await expect(tabs.getByRole('link', { name: new RegExp(aba, 'i') })).toHaveAttribute('aria-current', 'page');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `aba ${aba}`).toBeLessThanOrEqual(0);
    }
  });
});
