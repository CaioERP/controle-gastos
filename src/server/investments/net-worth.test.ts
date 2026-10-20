import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  assets,
  holdings,
  institutions,
  invoices,
  netWorthSnapshots,
  transactions,
} from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import { captureNetWorthSnapshot, computeNetWorth } from './net-worth';

describe('net worth snapshots (A3-03)', () => {
  async function setup() {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.slug, 'nubank'))
      .limit(1);

    // 1. Conta corrente com saldo R$ 5.000,00 (500000 centavos)
    const [checking] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'checking',
        name: 'NuConta',
        balanceCents: 500000,
        includeInTotals: true,
      })
      .returning();

    // 2. Conta de investimentos com holding de R$ 20.000,00 (2000000 centavos)
    const [invAcc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'investment',
        name: 'NuInvest',
        balanceCents: 2000000,
        includeInTotals: true,
      })
      .returning();

    const [asset] = await db
      .insert(assets)
      .values({
        code: 'B3:PETR4',
        name: 'Petrobras',
        assetClass: 'stocks',
        ticker: 'PETR4',
      })
      .returning();

    await db.insert(holdings).values({
      accountId: invAcc!.id,
      assetId: asset!.id,
      source: 'manual',
      externalId: 'manual:h1',
      quantity: '500.00000000',
      investedCents: 1800000,
      currentValueCents: 2000000,
      asOfDate: '2026-10-20',
    });

    // 3. Cartão de crédito com fatura aberta de R$ 1.500,00 (150000 centavos)
    const [cardAcc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'credit_card',
        name: 'Cartão Nubank',
        balanceCents: 0,
        includeInTotals: true,
      })
      .returning();

    const [openInv] = await db
      .insert(invoices)
      .values({
        accountId: cardAcc!.id,
        referenceMonth: '2026-10-01',
        closingDate: '2026-10-25',
        dueDate: '2026-11-02',
        status: 'open',
        totalCents: 150000,
      })
      .returning();

    const [futureInv] = await db
      .insert(invoices)
      .values({
        accountId: cardAcc!.id,
        referenceMonth: '2026-11-01',
        closingDate: '2026-11-25',
        dueDate: '2026-12-02',
        status: 'open',
        totalCents: 40000,
      })
      .returning();

    // Transação projetada que já pertence à fatura aberta de outubro (NÃO deve ser duplicada)
    await db.insert(transactions).values({
      accountId: cardAcc!.id,
      invoiceId: openInv!.id,
      date: '2026-10-15',
      amountCents: -50000, // R$ 500,00
      kind: 'expense',
      paymentMethod: 'credit_card_installment',
      status: 'projected',
      descriptionRaw: 'Compra Mercado 1/3',
      description: 'Compra Mercado 1/3',
    });

    // Duas parcelas futuras projetadas nos meses seguintes (R$ 400,00 cada = R$ 800,00 total / 80000 centavos)
    await db.insert(transactions).values({
      accountId: cardAcc!.id,
      invoiceId: futureInv!.id,
      date: '2026-11-15',
      amountCents: -40000,
      kind: 'expense',
      paymentMethod: 'credit_card_installment',
      status: 'projected',
      descriptionRaw: 'Compra Mercado 2/3',
      description: 'Compra Mercado 2/3',
    });

    await db.insert(transactions).values({
      accountId: cardAcc!.id,
      invoiceId: null, // sem fatura ainda gerada para dezembro
      date: '2026-12-15',
      amountCents: -40000,
      kind: 'expense',
      paymentMethod: 'credit_card_installment',
      status: 'projected',
      descriptionRaw: 'Compra Mercado 3/3',
      description: 'Compra Mercado 3/3',
    });

    return { db, inst: inst!, checking: checking!, invAcc: invAcc!, cardAcc: cardAcc! };
  }

  it('calcula patrimônio líquido exatamente sem dupla contagem de parcelas', async () => {
    const { db } = await setup();

    const nw = await computeNetWorth(db, '2026-10-20');

    // Ativos: R$ 5.000 (caixa) + R$ 20.000 (investimentos) = R$ 25.000 (2500000 centavos)
    expect(nw.cashAccountsCents).toBe(500000);
    expect(nw.investmentsCents).toBe(2000000);
    expect(nw.assetsCents).toBe(2500000);

    // Passivos: R$ 1.500 (fatura aberta) + R$ 800 (parcelas futuras nov/dez) = R$ 2.300 (230000 centavos)
    // A parcela de R$ 500 que pertence à fatura de outubro NÃO foi duplicada!
    expect(nw.openInvoicesCents).toBe(150000);
    expect(nw.futureInstallmentsCents).toBe(80000);
    expect(nw.liabilitiesCents).toBe(230000);

    // Patrimônio líquido: 2500000 - 230000 = 2270000 (R$ 22.700,00)
    expect(nw.netWorthCents).toBe(2270000);

    // Breakdown por classe
    expect(nw.breakdown.byAssetClass.stocks).toBe(2000000);

    // Breakdown por instituição
    expect(nw.breakdown.byInstitution).toHaveLength(1);
    expect(nw.breakdown.byInstitution[0]?.assetsCents).toBe(2500000);
    expect(nw.breakdown.byInstitution[0]?.liabilitiesCents).toBe(230000);
  });

  it('grava snapshot idempotente via captureNetWorthSnapshot', async () => {
    const { db } = await setup();

    await captureNetWorthSnapshot(db, '2026-10-20');
    await captureNetWorthSnapshot(db, '2026-10-20');

    const snapshots = await db.select().from(netWorthSnapshots);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.netWorthCents).toBe(2270000);
    expect(snapshots[0]?.date).toBe('2026-10-20');
  });
});
