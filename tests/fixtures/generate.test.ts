import { describe, expect, it } from 'vitest';
import { generateFixtures } from './generate';
import { createTestDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from './load';
import { invoices, transactions } from '@/server/db/schema';
import { PAYMENT_METHODS, TX_KINDS } from '@/server/domain/enums';

describe('fixtures generator', () => {
  const refDate = '2026-10-15';
  const opts = { referenceDate: refDate, months: 6, seed: 42 };

  it('mesma semente produz resultado idêntico', () => {
    const a = generateFixtures(opts);
    const b = generateFixtures(opts);
    expect(a).toEqual(b);
  });

  it('existe ao menos 1 transação de cada payment_method, exceto cash e other', () => {
    const data = generateFixtures(opts);
    const usedMethods = new Set(data.transactions.map((t) => t.paymentMethod));
    for (const m of PAYMENT_METHODS) {
      if (m === 'cash' || m === 'other') continue;
      expect(usedMethods.has(m)).toBe(true);
    }
  });

  it('existe ao menos 1 transação de cada kind, exceto adjustment', () => {
    const data = generateFixtures(opts);
    const usedKinds = new Set(data.transactions.map((t) => t.kind));
    for (const k of TX_KINDS) {
      if (k === 'adjustment') continue;
      expect(usedKinds.has(k)).toBe(true);
    }
  });

  it('parcelas: o grupo do notebook tem exatamente 10 transações, numeradas de 1 a 10, e as que ficam depois de referenceDate têm status projected', () => {
    const data = generateFixtures(opts);
    const notebookTxs = data.transactions
      .filter((t) => t.installment?.groupKey === 'inst-notebook')
      .sort((x, y) => (x.installment?.number ?? 0) - (y.installment?.number ?? 0));

    expect(notebookTxs.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      const tx = notebookTxs[i]!;
      expect(tx.installment?.number).toBe(i + 1);
      expect(tx.installment?.total).toBe(10);
      if (tx.date > refDate) {
        expect(tx.status).toBe('projected');
      } else {
        expect(tx.status).toBe('posted');
      }
    }
  });

  it('toda transação de conta-cartão tem invoiceKey', () => {
    const data = generateFixtures(opts);
    const cardAccountKeys = new Set(
      data.accounts.filter((a) => a.type === 'credit_card').map((a) => a.key)
    );
    const cardTxs = data.transactions.filter((t) => cardAccountKeys.has(t.accountKey));
    expect(cardTxs.length).toBeGreaterThan(0);
    for (const tx of cardTxs) {
      expect(tx.invoiceKey).toBeTruthy();
    }
  });

  it('para cada fatura paid existe um invoice_payment com valor = -totalCents', () => {
    const data = generateFixtures(opts);
    const paidInvoices = data.invoices.filter((i) => i.status === 'paid' && i.totalCents > 0);
    expect(paidInvoices.length).toBeGreaterThan(0);

    for (const inv of paidInvoices) {
      const paymentTx = data.transactions.find(
        (t) => t.kind === 'invoice_payment' && t.invoiceKey === inv.key
      );
      expect(paymentTx).toBeDefined();
      expect(paymentTx?.amountCents).toBe(-inv.totalCents);
      expect(paymentTx?.date).toBe(inv.dueDate);
    }
  });

  it('pares de transferência: 2 transações por transferKey com valores que somam zero', () => {
    const data = generateFixtures(opts);
    const transferMap = new Map<string, typeof data.transactions>();
    for (const t of data.transactions) {
      if (t.transferKey) {
        if (!transferMap.has(t.transferKey)) {
          transferMap.set(t.transferKey, []);
        }
        transferMap.get(t.transferKey)!.push(t);
      }
    }
    expect(transferMap.size).toBeGreaterThan(0);
    for (const pair of transferMap.values()) {
      expect(pair.length).toBe(2);
      const sum = pair[0]!.amountCents + pair[1]!.amountCents;
      expect(sum).toBe(0);
    }
  });

  it('nenhuma transação posted depois de referenceDate', () => {
    const data = generateFixtures(opts);
    const futurePosted = data.transactions.filter(
      (t) => t.status === 'posted' && t.date > refDate
    );
    expect(futurePosted.length).toBe(0);
  });

  it('teste de integração: loadFixtures popula banco e atinge critérios de volume', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, opts);

    const txRows = await db.select().from(transactions);
    const invRows = await db.select().from(invoices);

    expect(txRows.length).toBeGreaterThan(150);
    expect(invRows.length).toBeGreaterThan(0);
  });
});
