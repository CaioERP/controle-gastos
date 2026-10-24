import { describe, expect, it } from 'vitest';
import { and, between, eq, isNotNull, ne } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { loadFixtures } from '../../../tests/fixtures/load';
import { accounts, categories, transactions } from '../db/schema';
import { seedBase } from '../db/seed';
import { getLimitPeriodRange, getLimitSpent, getSpentRows } from './engine';
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

    // Uma conta com gasto no mês fica fora dos totais: só conta na meta da própria conta
    const [outTx] = await db
      .select({ accountId: transactions.accountId })
      .from(transactions)
      .where(
        and(
          ne(transactions.accountId, acc!.id),
          eq(transactions.kind, 'expense'),
          between(transactions.date, range.from, range.to),
        ),
      )
      .limit(1);
    expect(outTx).toBeDefined();
    await db.update(accounts).set({ includeInTotals: false }).where(eq(accounts.id, outTx!.accountId));

    const rows = await getSpentRows(db, range);

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

    // 6. Meta da conta fora dos totais
    const critOut = { accountId: outTx!.accountId };
    const spentOutBatch = spentForLimit(critOut, rows);
    expect(spentOutBatch).toBe(await getLimitSpent(db, critOut, range));
    expect(spentOutBatch).toBeGreaterThan(0);
  });
});
