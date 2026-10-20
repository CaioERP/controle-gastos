import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import type { TxFilters } from '@/server/domain/filters';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories } from '@/server/queries/catalog';
import { getCrossTab } from '@/server/queries/crosstab';
import { listTransactions } from '@/server/queries/transactions';
import { parseFilters } from '@/server/queries/url-filters';
import {
  categoryTransactionsHref,
  crossTransactionsHref,
  parentCategoryIds,
  paymentMethodTransactionsHref,
} from './links';

const REF = '2026-10-15';

/**
 * Para cada fatia/barra/célula com link, o gasto da lista aberta pelo link (o que /transacoes mostra,
 * todas as páginas) tem que ser igual ao valor do gráfico.
 */
describe('links de detalhamento reproduzem o valor do gráfico', () => {
  let db: Db;
  let parentIds: Set<string>;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: REF, months: 6, seed: 42 });
    parentIds = parentCategoryIds(await listCategories(db));
  });

  /** Gasto da lista aberta pelo link: despesa soma, estorno abate (mesma regra de spendValue). */
  async function listSpend(href: string): Promise<number> {
    const f = parseFilters(href.split('?')[1] ?? '', REF);
    let cursor: string | undefined;
    let total = 0;
    do {
      const page = await listTransactions(db, f, { cursor, limit: 200 });
      for (const t of page.items) total -= t.amountCents;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return total;
  }

  const scenarios: Array<[string, string]> = [
    ['mês (dashboard padrão)', 'mes=2026-10'],
    ['mês anterior, regime de caixa', 'mes=2026-09&regime=caixa'],
    ['período largo', 'de=2026-05-01&ate=2026-10-15'],
    ['natureza explícita com transferência', 'mes=2026-10&natureza=expense,transfer,invoice_payment'],
  ];

  for (const [name, qs] of scenarios) {
    it(`forma de pagamento e categoria — ${name}`, async () => {
      const filters: TxFilters = parseFilters(qs, REF);
      let checked = 0;

      for (const item of await getBreakdown(db, filters, 'paymentMethod')) {
        const href = paymentMethodTransactionsHref(filters, item.key);
        if (!href) continue;
        expect(await listSpend(href), `forma ${item.key}`).toBe(item.totalCents);
        checked++;
      }
      // Dashboard e análise sem `cat`: categoria pai (filtro do pai inclui as filhas)
      for (const item of await getBreakdown(db, filters, 'parentCategory')) {
        const href = categoryTransactionsHref(filters, item.key);
        if (!href) continue;
        expect(await listSpend(href), `categoria pai ${item.label}`).toBe(item.totalCents);
        checked++;
      }
      // Com `cat`: categoria exata (pais com filhas ficam sem link)
      for (const item of await getBreakdown(db, filters, 'category')) {
        const href = categoryTransactionsHref(filters, item.key, { parentIds });
        if (!href) continue;
        expect(await listSpend(href), `categoria ${item.label}`).toBe(item.totalCents);
        checked++;
      }
      expect(checked).toBeGreaterThan(10);
    });
  }

  it('células da matriz categoria × forma de pagamento (análise)', async () => {
    const filters = parseFilters('mes=2026-10', REF);
    const cross = await getCrossTab(db, filters, 'parentCategory', 'paymentMethod');
    let checked = 0;
    for (const [rowKey, cols] of Object.entries(cross.cells)) {
      for (const [colKey, cents] of Object.entries(cols)) {
        if (cents === 0) continue;
        const href = crossTransactionsHref(filters, rowKey, colKey);
        if (!href) continue;
        expect(await listSpend(href), `${rowKey} × ${colKey}`).toBe(cents);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('sem natureza na URL a lista traz naturezas que o gráfico não soma (por isso o link manda natureza)', async () => {
    const f = parseFilters('mes=2026-10&forma=pix', REF);
    const all = await listTransactions(db, f, { limit: 200 });
    expect(all.items.some((t) => t.kind !== 'expense' && t.kind !== 'refund')).toBe(true);
  });
});
