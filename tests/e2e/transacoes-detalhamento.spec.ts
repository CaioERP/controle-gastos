import { test, expect, type Page } from '@playwright/test';
import { loginIfNeeded } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginIfNeeded(page);
});

/** "-R$ 1.234,56" → -123456 */
function toCents(text: string): number {
  const m = text.replace(/ /g, ' ').match(/([+-]?)R\$\s*([\d.]+),(\d{2})/);
  if (!m) throw new Error(`valor não encontrado em "${text}"`);
  const cents = Number(m[2]!.replace(/\./g, '')) * 100 + Number(m[3]);
  return m[1] === '-' ? -cents : cents;
}

/** Soma dos "Saldo do dia" de todas as páginas da lista (carrega tudo antes). */
async function listBalance(page: Page): Promise<number> {
  const more = page.getByRole('button', { name: 'Carregar mais' });
  for (let i = 0; i < 20 && (await more.count()) > 0; i++) {
    await more.click();
    await expect(page.getByRole('button', { name: 'Carregando...' })).toHaveCount(0);
  }
  const texts = await page.locator('section[aria-labelledby^="dia-"] > div > span').allTextContents();
  expect(texts.length).toBeGreaterThan(0);
  return texts.reduce((sum, t) => sum + toCents(t), 0);
}

test.describe('Detalhamento do dashboard para /transacoes', () => {
  test('a barra "Crédito à vista" abre a lista com a natureza do gráfico e o mesmo total', async ({ page }) => {
    // Mês corrente: os dados fictícios são gerados a partir da data do db:reset.
    await page.goto('/');
    const bars = page.getByRole('list', { name: 'Gastos por forma de pagamento' });
    const link = bars.locator('a[href*="forma=credit_card_single"]');
    await expect(link).toBeVisible();
    const barCents = toCents((await link.textContent())!);
    expect(barCents).toBeGreaterThan(0);

    const href = (await link.getAttribute('href'))!;
    expect(new URLSearchParams(href.split('?')[1]).get('natureza')).toBe('expense,refund');

    await link.click();
    await expect(page).toHaveURL(/\/transacoes\?.*forma=credit_card_single/);
    await expect(page.locator('li[data-tx-id]').first()).toBeVisible();
    // Saldo dos dias = soma dos valores (despesa negativa, estorno positivo) = -(gasto da barra)
    expect(await listBalance(page)).toBe(-barCents);
  });
});
