import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { generateFixtures } from '../../../tests/fixtures/generate';
import { loadFixtures } from '../../../tests/fixtures/load';
import { seedBase } from '@/server/db/seed';
import { accounts, invoices } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getInvoices } from './invoices';
import { getInvoiceExtras } from './invoice-extras';

describe('queries / invoice-extras', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('fatura paga mostra o pagamento vinculado (data e valor positivo); aberta não tem pagamento', async () => {
    const data = generateFixtures(fixtureOpts);
    const [card] = await db.select().from(accounts).where(eq(accounts.name, 'Mercado Pago'));
    const list = await getInvoices(db, card!.id);

    const paid = list.find((i) => i.status === 'paid' && i.totalCents > 0)!;
    const oracle = data.transactions.find(
      (t) => t.kind === 'invoice_payment' && t.invoiceKey === `mp-card-${paid.referenceMonth}`,
    )!;
    const extras = await getInvoiceExtras(db, paid.id);
    expect(extras!.payment).toEqual({ date: oracle.date, amountCents: Math.abs(oracle.amountCents) });
    expect(extras!.payment!.amountCents).toBe(paid.totalCents);
    expect(extras!.minimumPaymentCents).toBeNull();

    const open = list.find((i) => i.status === 'open')!;
    expect((await getInvoiceExtras(db, open.id))!.payment).toBeNull();
  });

  it('usa paidAt/paidAmountCents e o mínimo gravados na fatura quando existem', async () => {
    const [card] = await db.select().from(accounts).where(eq(accounts.name, 'Nubank'));
    const [open] = (await getInvoices(db, card!.id)).filter((i) => i.status === 'open');
    await db
      .update(invoices)
      .set({ paidAt: '2026-10-20', paidAmountCents: 12345, minimumPaymentCents: 5000 })
      .where(eq(invoices.id, open!.id));

    expect(await getInvoiceExtras(db, open!.id)).toEqual({
      minimumPaymentCents: 5000,
      payment: { date: '2026-10-20', amountCents: 12345 },
    });
  });

  it('fatura inexistente devolve null', async () => {
    expect(await getInvoiceExtras(db, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
