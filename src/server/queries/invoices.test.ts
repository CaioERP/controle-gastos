import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { accounts } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getInvoiceItems, getInvoices } from './invoices';

describe('queries / invoices', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('getInvoices lista faturas e getInvoiceItems soma igual ao totalCents', async () => {
    const [cardAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.name, 'Itaú Click'));
    expect(cardAccount).toBeDefined();

    const invList = await getInvoices(db, cardAccount!.id);
    expect(invList.length).toBeGreaterThan(0);

    // Para cada fatura com itens, confere que getInvoiceItems bate com o total da fatura (descontando estornos)
    const closedOrPaid = invList.find((i) => i.status === 'paid' && i.totalCents > 0);
    expect(closedOrPaid).toBeDefined();

    const items = await getInvoiceItems(db, closedOrPaid!.id);
    expect(items.length).toBe(closedOrPaid!.itemCount);

    let sum = 0;
    for (const item of items) {
      if (item.kind === 'refund') {
        sum -= Math.abs(item.amountCents);
      } else {
        sum += Math.abs(item.amountCents);
      }
    }
    expect(sum).toBe(closedOrPaid!.totalCents);
  });
});
