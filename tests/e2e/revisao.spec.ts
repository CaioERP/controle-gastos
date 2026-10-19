import { test, expect, type Page } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

// Estes testes alteram a fila; rode `npm run db:reset` antes da suíte. As contagens são relativas
// (outros testes em paralelo também podem tirar transações da fila).
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

async function topCount(page: Page): Promise<number> {
  const text = (await page.getByTestId('review-count').innerText()).trim();
  if (text.startsWith('Nenhuma')) return 0;
  return Number(text.match(/^(\d+)/)![1]);
}

function sidebarBadge(page: Page) {
  return page.locator('aside nav a[href="/revisao"] [data-slot="review-count-badge"]');
}

function activeCard(page: Page) {
  return page.locator('article[aria-current="true"]');
}

test.describe('Fila de revisão', () => {
  test('o badge do menu reflete a contagem real e a fila mostra os cards', async ({ page }) => {
    await page.goto('/revisao');
    await expect(page.locator('h1')).toHaveText('Revisão');
    const n = await topCount(page);
    expect(n).toBeGreaterThan(0);
    await expect(sidebarBadge(page)).toContainText(String(n));
    await expect(page.locator('article[data-review-id]')).toHaveCount(Math.min(n, 30));
    // Legenda de atalhos visível
    await expect(page.getByLabel('Atalhos de teclado')).toContainText('Enter');
  });

  test('funciona em 390 px sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/revisao');
    await expect(activeCard(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('confirmar uma sugestão diminui o contador e o badge', async ({ page }) => {
    await page.goto('/revisao');
    const before = await topCount(page);
    const card = page.locator('article[data-review-id]').filter({ has: page.getByRole('button', { name: 'Confirmar', exact: true }) }).first();
    const id = await card.getAttribute('data-review-id');
    await card.getByRole('button', { name: 'Confirmar', exact: true }).click();

    await expect(page.getByText(/^Sugestão confirmada:/)).toBeVisible();
    await expect(page.locator(`article[data-review-id="${id}"]`)).toHaveCount(0);
    await expect.poll(() => topCount(page)).toBeLessThan(before);
    const after = await topCount(page);
    await expect(sidebarBadge(page)).toContainText(String(after));

    await page.reload();
    await expect(page.locator(`article[data-review-id="${id}"]`)).toHaveCount(0);
  });

  test('a tecla 1 aplica a primeira categoria rápida e S pula para o próximo', async ({ page }) => {
    await page.goto('/revisao');
    const quick1 = page.getByRole('group', { name: 'Categorias rápidas' }).getByRole('button').first();
    const quickName = ((await quick1.getAttribute('aria-label')) ?? '').replace(/^1: /, '');

    // Pula até um card de despesa (categorias rápidas habilitadas)
    // Card ativo focado = página hidratada e atalhos de teclado ativos
    await expect(activeCard(page)).toBeFocused();
    for (let i = 0; i < 30 && (await quick1.isDisabled()); i++) await page.keyboard.press('s');
    await expect(quick1).toBeEnabled();

    // S muda o card ativo sem alterar nada
    const first = await activeCard(page).getAttribute('data-review-id');
    await page.keyboard.press('s');
    await expect(activeCard(page)).not.toHaveAttribute('data-review-id', first!);
    await expect(page.locator(`article[data-review-id="${first}"]`)).toHaveCount(1);
    for (let i = 0; i < 30 && (await quick1.isDisabled()); i++) await page.keyboard.press('s');

    const id = await activeCard(page).getAttribute('data-review-id');
    await page.keyboard.press('1');
    await expect(page.getByText(new RegExp(`em ${quickName}$`)).first()).toBeVisible();
    await expect(page.locator(`article[data-review-id="${id}"]`)).toHaveCount(0);

    await page.reload();
    await expect(page.locator(`article[data-review-id="${id}"]`)).toHaveCount(0);
  });

  test('confirmar em lote as sugestões com confiança ≥ 70%', async ({ page }) => {
    await page.goto('/revisao');
    const bulk = page.getByRole('button', { name: /^Confirmar todas as sugestões com confiança ≥ 70% \((\d+)\)$/ });
    await expect(bulk).toBeVisible();
    const total = Number((await bulk.innerText()).match(/\((\d+)\)$/)![1]);
    const before = await topCount(page);

    await bulk.click();
    await expect(page.getByText(new RegExp(`^${total} sugest(ão confirmada|ões confirmadas)$`))).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Confirmar todas as sugestões/ })).toHaveCount(0);
    await expect.poll(() => topCount(page)).toBeLessThanOrEqual(before - total);
  });

  test('revisar várias transações só pelo teclado', async ({ page }) => {
    await page.goto('/revisao');
    await expect(activeCard(page)).toBeFocused();
    const start = await topCount(page);
    const target = Math.min(5, start);
    let resolved = 0;

    for (let i = 0; i < target; i++) {
      const card = activeCard(page);
      await expect(card).toHaveCount(1);
      const id = await card.getAttribute('data-review-id');
      const canConfirm = (await card.getByRole('button', { name: 'Confirmar', exact: true }).count()) > 0;
      const quickEnabled = await page
        .getByRole('group', { name: 'Categorias rápidas' })
        .getByRole('button')
        .first()
        .isEnabled();
      if (canConfirm) await page.keyboard.press('Enter');
      else if (quickEnabled) await page.keyboard.press('1');
      else await page.keyboard.press('t');
      await expect(page.locator(`article[data-review-id="${id}"]`)).toHaveCount(0);
      resolved++;
    }

    await expect.poll(() => topCount(page)).toBeLessThanOrEqual(start - resolved);
    await expect(sidebarBadge(page).or(page.getByText('Tudo revisado 🎉'))).toBeVisible();
  });
});
