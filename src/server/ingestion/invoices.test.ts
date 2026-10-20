import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { accounts, invoices, institutions, transactions, transactionSources } from '../db/schema';
import { seedBase } from '../db/seed';
import {
  assignInvoices,
  computeInvoiceStatus,
  recalculateInvoices,
  upsertInvoicesFromSource,
} from './invoices';

describe('computeInvoiceStatus (A1-04)', () => {
  it('retorna os 4 status possíveis conforme fechamento, vencimento e pagamento', () => {
    const base = { closingDate: '2026-10-10', dueDate: '2026-10-17', paidAt: null };
    expect(computeInvoiceStatus(base, '2026-10-10')).toBe('open');
    expect(computeInvoiceStatus(base, '2026-10-15')).toBe('closed');
    expect(computeInvoiceStatus(base, '2026-10-18')).toBe('overdue');
    expect(computeInvoiceStatus({ ...base, paidAt: '2026-10-16' }, '2026-10-25')).toBe('paid');
  });
});

describe('invoices association and totals (A1-04)', () => {
  it('associa compras no dia do fechamento, no dia seguinte e em fevereiro com fechamento dia 30', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const [inst] = await db.select().from(institutions).limit(1);

    // Cartão 1: fecha dia 10, vence dia 17
    const [card1] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'credit_card',
        name: 'Cartão 10/17',
        closingDay: 10,
        dueDay: 17,
      })
      .returning();

    // Cartão 2: fecha dia 30, vence dia 5
    const [card2] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'credit_card',
        name: 'Cartão 30/05',
        closingDay: 30,
        dueDay: 5,
      })
      .returning();

    const [txOnClosing, txAfterClosing] = await db
      .insert(transactions)
      .values([
        {
          accountId: card1!.id,
          date: '2026-10-10', // Dia do fechamento → fatura que fecha em 10/10 e vence em 17/10
          amountCents: -10000,
          descriptionRaw: 'COMPRA DIA FECHAMENTO',
          description: 'Compra Dia Fechamento',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
        },
        {
          accountId: card1!.id,
          date: '2026-10-11', // Dia seguinte → fatura que fecha em 10/11 e vence em 17/11
          amountCents: -25000,
          descriptionRaw: 'COMPRA DIA SEGUINTE',
          description: 'Compra Dia Seguinte',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
        },
      ])
      .returning();

    const [txFeb] = await db
      .insert(transactions)
      .values({
        accountId: card2!.id,
        date: '2026-02-28', // Fevereiro com closingDay 30 → fecha em 28/02 e vence em 05/03
        amountCents: -18000,
        descriptionRaw: 'COMPRA FEVEREIRO',
        description: 'Compra Fevereiro',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
      })
      .returning();

    await assignInvoices(db, [card1!.id, card2!.id], '2026-10-15');
    await recalculateInvoices(db, [card1!.id, card2!.id], '2026-10-15');

    const [t1] = await db.select().from(transactions).where(eq(transactions.id, txOnClosing!.id));
    const [t2] = await db.select().from(transactions).where(eq(transactions.id, txAfterClosing!.id));
    const [tFeb] = await db.select().from(transactions).where(eq(transactions.id, txFeb!.id));

    expect(t1!.invoiceId).not.toBeNull();
    expect(t2!.invoiceId).not.toBeNull();
    expect(t1!.invoiceId).not.toBe(t2!.invoiceId);
    expect(tFeb!.invoiceId).not.toBeNull();

    const [inv1] = await db.select().from(invoices).where(eq(invoices.id, t1!.invoiceId!));
    expect(inv1!.referenceMonth).toBe('2026-10-01');
    expect(inv1!.closingDate).toBe('2026-10-10');
    expect(inv1!.dueDate).toBe('2026-10-17');
    expect(inv1!.totalCents).toBe(10000);
    expect(inv1!.status).toBe('closed');

    const [inv2] = await db.select().from(invoices).where(eq(invoices.id, t2!.invoiceId!));
    expect(inv2!.referenceMonth).toBe('2026-11-01');
    expect(inv2!.closingDate).toBe('2026-11-10');
    expect(inv2!.dueDate).toBe('2026-11-17');
    expect(inv2!.totalCents).toBe(25000);
    expect(inv2!.status).toBe('open');

    const [invFeb] = await db.select().from(invoices).where(eq(invoices.id, tFeb!.invoiceId!));
    expect(invFeb!.referenceMonth).toBe('2026-03-01');
    expect(invFeb!.closingDate).toBe('2026-02-28');
    expect(invFeb!.dueDate).toBe('2026-03-05');
    expect(invFeb!.totalCents).toBe(18000);
  });

  it('deduz ciclo das faturas da fonte quando a conta não tem closingDay/dueDay e preserva total da fonte', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const [inst] = await db.select().from(institutions).limit(1);

    const [card] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'credit_card',
        name: 'Cartão Sem Ciclo',
        closingDay: null,
        dueDay: null,
      })
      .returning();

    await upsertInvoicesFromSource(
      db,
      card!.id,
      [
        {
          externalId: 'bill-oct',
          dueDate: '2026-10-20',
          closingDate: '2026-10-13',
          totalCents: 99900,
          minimumPaymentCents: 15000,
          raw: {},
        },
      ],
      undefined,
      '2026-10-15',
    );

    const [updatedAcc] = await db.select().from(accounts).where(eq(accounts.id, card!.id));
    expect(updatedAcc!.closingDay).toBe(13);
    expect(updatedAcc!.dueDay).toBe(20);

    await db.insert(transactions).values({
      accountId: card!.id,
      date: '2026-10-05',
      amountCents: -40000,
      descriptionRaw: 'COMPRA NA FATURA DA FONTE',
      description: 'Compra Na Fatura Da Fonte',
      kind: 'expense',
      paymentMethod: 'credit_card_single',
    });

    await assignInvoices(db, [card!.id], '2026-10-15');
    await recalculateInvoices(db, [card!.id], '2026-10-15');

    const [inv] = await db.select().from(invoices).where(eq(invoices.accountId, card!.id));
    // Fatura da fonte mantém o totalCents informado pela fonte
    expect(inv!.totalCents).toBe(99900);
  });
});

describe('assignInvoices com transação deduplicada (revisão pós-merge)', () => {
  it('fonte Pluggy com billId vence o ciclo calculado mesmo com uma fonte file ligada', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const [inst] = await db.select().from(institutions).limit(1);
    const [card] = await db
      .insert(accounts)
      .values({ institutionId: inst!.id, type: 'credit_card', name: 'Cartão', closingDay: 10, dueDay: 17 })
      .returning();
    // Pelo ciclo, 05/10 cairia na fatura de outubro; o Pluggy diz que está na de novembro
    const [billInv] = await db
      .insert(invoices)
      .values({
        accountId: card!.id,
        referenceMonth: '2026-11-01',
        closingDate: '2026-11-10',
        dueDate: '2026-11-17',
        totalCents: 10000,
        externalId: 'bill-nov',
        status: 'open',
      })
      .returning();
    const [tx] = await db
      .insert(transactions)
      .values({
        accountId: card!.id,
        date: '2026-10-05',
        amountCents: -10000,
        descriptionRaw: 'LOJA',
        description: 'Loja',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
      })
      .returning();
    await db.insert(transactionSources).values([
      { transactionId: tx!.id, source: 'pluggy', externalId: 'pl-1', raw: { creditCardMetadata: { billId: 'bill-nov' } } },
      { transactionId: tx!.id, source: 'file', externalId: 'file-1', raw: { memo: 'LOJA' } },
    ]);

    await assignInvoices(db, [card!.id], '2026-10-20');

    const [after] = await db.select().from(transactions).where(eq(transactions.id, tx!.id));
    expect(after!.invoiceId).toBe(billInv!.id);
  });
});
