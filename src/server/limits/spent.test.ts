import { describe, expect, it } from 'vitest';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { loadFixtures } from '../../../tests/fixtures/load';
import { accounts, categories, invoices, transactions } from '../db/schema';
import { seedBase } from '../db/seed';
import { buildTxWhere, spendValue } from '../queries/base';
import { getLimitPeriodRange, getLimitSpent } from './engine';
import { spentForLimit } from './spent';

describe('spentForLimit batch evaluation (A6-11)', () => {
  it('produz exatamente o mesmo resultado que getLimitSpent para cada tipo de meta', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const refDate = '2026-10-15';
    await loadFixtures(db, { referenceDate: refDate, months: 6, seed: 42 });

    const range = getLimitPeriodRange('monthly', refDate);

    // Encontra categoria filha e categoria pai
    const [childCat] = await db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(isNotNull(categories.parentId))
      .limit(1);

    expect(childCat).toBeDefined();
    const parentId = childCat!.parentId!;

    // Encontra uma conta
    const [acc] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.includeInTotals, true))
      .limit(1);

    expect(acc).toBeDefined();

    // Consulta em lote agrupada
    const where = buildTxWhere(
      {
        from: range.from,
        to: range.to,
        basis: 'accrual',
      },
      { forTotals: true },
    );

    const rawRows = await db
      .select({
        categoryId: transactions.categoryId,
        categoryParentId: categories.parentId,
        paymentMethod: transactions.paymentMethod,
        accountId: transactions.accountId,
        spentCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(where)
      .groupBy(
        transactions.categoryId,
        categories.parentId,
        transactions.paymentMethod,
        transactions.accountId,
      );

    const rows = rawRows.map((r) => ({
      categoryId: r.categoryId,
      categoryParentId: r.categoryParentId,
      paymentMethod: r.paymentMethod,
      accountId: r.accountId,
      spentCents: Number(r.spentCents ?? 0),
    }));

    // 1. Meta por categoria filha
    const critChild = { categoryId: childCat!.id };
    const spentChildBatch = spentForLimit(critChild, rows);
    const spentChildEngine = await getLimitSpent(db, critChild, range);
    expect(spentChildBatch).toBe(spentChildEngine);

    // 2. Meta por categoria pai (deve incluir as filhas)
    const critParent = { categoryId: parentId };
    const spentParentBatch = spentForLimit(critParent, rows);
    const spentParentEngine = await getLimitSpent(db, critParent, range);
    expect(spentParentBatch).toBe(spentParentEngine);
    expect(spentParentBatch).toBeGreaterThan(0);

    // 3. Meta por forma de pagamento
    const critPayment = { paymentMethod: 'credit_card_single' as const };
    const spentPaymentBatch = spentForLimit(critPayment, rows);
    const spentPaymentEngine = await getLimitSpent(db, critPayment, range);
    expect(spentPaymentBatch).toBe(spentPaymentEngine);
    expect(spentPaymentBatch).toBeGreaterThan(0);

    // 4. Meta por conta
    const critAccount = { accountId: acc!.id };
    const spentAccountBatch = spentForLimit(critAccount, rows);
    const spentAccountEngine = await getLimitSpent(db, critAccount, range);
    expect(spentAccountBatch).toBe(spentAccountEngine);

    // 5. Meta mista (categoria e forma de pagamento)
    const critMixed = {
      categoryId: parentId,
      paymentMethod: 'pix' as const,
    };
    const spentMixedBatch = spentForLimit(critMixed, rows);
    const spentMixedEngine = await getLimitSpent(db, critMixed, range);
    expect(spentMixedBatch).toBe(spentMixedEngine);
  });
});
