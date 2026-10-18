import { describe, expect, it } from 'vitest';
import { generateFixtures } from './generate';
import { createTestDb } from '../helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from './load';
import { accounts, invoices, merchants, transactions } from '@/server/db/schema';
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

  it('existe ao menos 1 transação de cada kind', () => {
    const data = generateFixtures(opts);
    const usedKinds = new Set(data.transactions.map((t) => t.kind));
    for (const k of TX_KINDS) {
      expect(usedKinds.has(k)).toBe(true);
    }
  });

  it('origens de categoria variadas e IA de baixa confiança sempre vai para revisão', () => {
    const data = generateFixtures(opts);
    const sources = new Set(data.transactions.map((t) => t.categorySource));
    for (const s of ['merchant', 'rule', 'llm', 'provider', 'default'] as const) {
      expect(sources.has(s)).toBe(true);
    }
    const lowLlm = data.transactions.filter(
      (t) => t.categorySource === 'llm' && (t.categoryConfidence ?? 1) < 0.8,
    );
    expect(lowLlm.length).toBeGreaterThan(0);
    for (const t of lowLlm) expect(t.needsReview).toBe(true);
    for (const t of data.transactions.filter((x) => ['transfer', 'invoice_payment', 'investment'].includes(x.kind))) {
      expect(t.categorySlug ?? null).toBeNull();
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
    const accRows = await db.select().from(accounts);
    const merchantRows = await db.select().from(merchants);

    expect(txRows.length).toBeGreaterThan(150);
    expect(invRows.length).toBeGreaterThan(0);

    // Estabelecimentos gravados e ligados às compras com cartão/débito
    expect(merchantRows.length).toBeGreaterThan(10);
    expect(merchantRows.some((m) => m.defaultCategoryId !== null)).toBe(true);
    const purchases = txRows.filter(
      (t) => t.kind === 'expense' && ['credit_card_single', 'credit_card_installment', 'debit_card'].includes(t.paymentMethod),
    );
    const withMerchant = purchases.filter((t) => t.merchantId !== null);
    expect(withMerchant.length / purchases.length).toBeGreaterThan(0.8);

    // Saldo do cartão = −fatura atual (aberta de menor mês); limite disponível desconta tudo que não foi pago
    for (const acc of accRows.filter((a) => a.type === 'credit_card')) {
      const own = invRows.filter((i) => i.accountId === acc.id);
      const current = own
        .filter((i) => i.status === 'open')
        .sort((x, y) => x.referenceMonth.localeCompare(y.referenceMonth))[0];
      expect(acc.balanceCents).toBe(current ? -current.totalCents : 0);
      const unpaid = own.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.totalCents, 0);
      expect(acc.availableLimitCents).toBe(acc.creditLimitCents! - unpaid);
    }

    // Contas correntes com saldo positivo na data de referência
    for (const acc of accRows.filter((a) => a.type === 'checking')) {
      expect(acc.balanceCents).toBeGreaterThan(0);
    }
  });
});
