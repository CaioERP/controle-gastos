import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  assets,
  holdings,
  institutions,
  investmentTransactions,
} from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import { CommandError } from '@/server/domain/errors';
import {
  createManualHolding,
  deleteInvestmentTransaction,
  deleteManualHolding,
  recordIncomeTransaction,
  recordInvestmentTransaction,
  updateManualHolding,
  upsertManualHolding,
} from './investments';

describe('investment commands (A3-04)', () => {
  async function setup() {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.slug, 'nubank'))
      .limit(1);

    const [invAcc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'investment',
        name: 'Nubank Investimentos',
        balanceCents: 0,
        includeInTotals: true,
      })
      .returning();

    return { db, inst: inst!, invAcc: invAcc! };
  }

  it('cria posição manual de HGLG11, registra compra adicional e rendimento mensal', async () => {
    const { db, invAcc } = await setup();

    // 1. Criar posição manual de HGLG11: 100 cotas a R$ 155,00 (invested: 1.550.000, current: 1.620.000)
    const { holdingId, assetId } = await upsertManualHolding(db, {
      accountId: invAcc.id,
      assetClass: 'fii',
      name: 'CSHG Logística FII',
      ticker: 'HGLG11',
      quantity: '100',
      investedCents: 1550000,
      currentValueCents: 1620000,
      isTaxExempt: true,
    });

    expect(holdingId).toBeDefined();
    expect(assetId).toBeDefined();

    const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
    expect(asset?.code).toBe('B3:HGLG11');
    expect(asset?.ticker).toBe('HGLG11');
    expect(asset?.assetClass).toBe('fii');

    const [holding] = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    expect(holding?.source).toBe('manual');
    expect(holding?.quantity).toBe('100.00000000');
    expect(holding?.investedCents).toBe(1550000);
    expect(holding?.currentValueCents).toBe(1620000);
    expect(holding?.profitCents).toBe(70000);

    const [accAfterCreate] = await db.select().from(accounts).where(eq(accounts.id, invAcc.id));
    expect(accAfterCreate?.balanceCents).toBe(1620000);

    // 2. Compra adicional (buy) de 10 cotas por R$ 1.600,00
    const { investmentTransactionId: buyTxId } = await recordInvestmentTransaction(db, {
      holdingId,
      type: 'buy',
      date: '2026-10-15',
      amountCents: 160000,
      quantity: '10',
      description: 'Compra 10 HGLG11',
    });

    expect(buyTxId).toBeDefined();

    const [holdingAfterBuy] = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    expect(holdingAfterBuy?.quantity).toBe('110.00000000');
    expect(holdingAfterBuy?.investedCents).toBe(1710000);
    expect(holdingAfterBuy?.currentValueCents).toBe(1780000);

    const [accAfterBuy] = await db.select().from(accounts).where(eq(accounts.id, invAcc.id));
    expect(accAfterBuy?.balanceCents).toBe(1780000);

    // 3. Provento mensal (income) de R$ 121,00
    const { investmentTransactionId: incomeTxId } = await recordIncomeTransaction(db, {
      holdingId,
      date: '2026-10-18',
      amountCents: 12100,
      description: 'Rendimento FII HGLG11',
    });

    expect(incomeTxId).toBeDefined();

    const [holdingAfterIncome] = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    // Provento não altera quantidade nem custo da posição
    expect(holdingAfterIncome?.quantity).toBe('110.00000000');
    expect(holdingAfterIncome?.investedCents).toBe(1710000);
  });

  it('recusa excluir posição com source "pluggy" com erro VALIDATION', async () => {
    const { db, invAcc } = await setup();

    const [asset] = await db
      .insert(assets)
      .values({
        code: 'B3:VALE3',
        ticker: 'VALE3',
        name: 'Vale S.A.',
        assetClass: 'stocks',
      })
      .returning();

    const [pluggyHolding] = await db
      .insert(holdings)
      .values({
        accountId: invAcc.id,
        assetId: asset!.id,
        source: 'pluggy',
        externalId: 'inv-pluggy-vale3',
        quantity: '100.00000000',
        investedCents: 600000,
        currentValueCents: 650000,
        asOfDate: '2026-10-20',
      })
      .returning();

    await expect(deleteManualHolding(db, { holdingId: pluggyHolding!.id })).rejects.toThrow(
      CommandError,
    );

    await expect(deleteManualHolding(db, { holdingId: pluggyHolding!.id })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('excluir movimentação manual reverte o saldo e quantidade da posição', async () => {
    const { db, invAcc } = await setup();

    const { holdingId } = await createManualHolding(db, {
      accountId: invAcc.id,
      assetClass: 'stocks',
      name: 'Petrobras PN',
      ticker: 'PETR4',
      quantity: '100',
      investedCents: 380000,
      currentValueCents: 411800,
    });

    const { investmentTransactionId } = await recordInvestmentTransaction(db, {
      holdingId,
      type: 'buy',
      date: '2026-10-16',
      amountCents: 41180,
      quantity: '10',
      description: 'Compra 10 PETR4',
    });

    const [holdingBeforeDelete] = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    expect(holdingBeforeDelete?.quantity).toBe('110.00000000');
    expect(holdingBeforeDelete?.investedCents).toBe(421180);

    // Exclui a movimentação
    await deleteInvestmentTransaction(db, { investmentTransactionId });

    const [holdingAfterDelete] = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    expect(holdingAfterDelete?.quantity).toBe('100.00000000');
    expect(holdingAfterDelete?.investedCents).toBe(380000);
    expect(holdingAfterDelete?.currentValueCents).toBe(411800);

    const [txInDb] = await db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.id, investmentTransactionId));
    expect(txInDb).toBeUndefined();
  });

  it('atualiza posição manual e recalcula saldo da conta', async () => {
    const { db, invAcc } = await setup();

    const { holdingId } = await createManualHolding(db, {
      accountId: invAcc.id,
      assetClass: 'crypto',
      name: 'Bitcoin',
      ticker: 'bitcoin',
      quantity: '0.05',
      investedCents: 1500000,
      currentValueCents: 1800000,
    });

    await updateManualHolding(db, {
      holdingId,
      accountId: invAcc.id,
      assetClass: 'crypto',
      name: 'Bitcoin (BTC)',
      ticker: 'bitcoin',
      quantity: '0.05',
      investedCents: 1500000,
      currentValueCents: 2000000, // Cripto valorizou
    });

    const [holding] = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    expect(holding?.currentValueCents).toBe(2000000);
    expect(holding?.profitCents).toBe(500000);

    const [acc] = await db.select().from(accounts).where(eq(accounts.id, invAcc.id));
    expect(acc?.balanceCents).toBe(2000000);
  });

  it('venda acima da custódia é recusada sem gravar movimentação', async () => {
    const { db, invAcc } = await setup();
    const { holdingId } = await createManualHolding(db, {
      accountId: invAcc.id,
      assetClass: 'stocks',
      name: 'Petrobras PN',
      ticker: 'PETR4',
      quantity: '10',
      investedCents: 300000,
      currentValueCents: 400000,
    });

    await expect(
      recordInvestmentTransaction(db, {
        holdingId,
        type: 'sell',
        date: '2026-10-01',
        amountCents: 2000000,
        quantity: '50',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });

    const rows = await db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.holdingId, holdingId));
    expect(rows).toHaveLength(0);
  });

  it('excluir uma venda devolve o custo baixado, não o valor recebido', async () => {
    const { db, invAcc } = await setup();
    const { holdingId } = await createManualHolding(db, {
      accountId: invAcc.id,
      assetClass: 'stocks',
      name: 'Petrobras PN',
      ticker: 'PETR4',
      quantity: '100',
      investedCents: 1000000,
      currentValueCents: 1200000,
    });

    // Vende metade com lucro: custo baixado = R$ 5.000, valor recebido = R$ 6.000
    const { investmentTransactionId } = await recordInvestmentTransaction(db, {
      holdingId,
      type: 'sell',
      date: '2026-10-01',
      amountCents: 600000,
      quantity: '50',
    });
    await deleteInvestmentTransaction(db, { investmentTransactionId });

    const [holding] = await db.select().from(holdings).where(eq(holdings.id, holdingId));
    expect(holding?.quantity).toBe('100.00000000');
    expect(holding?.investedCents).toBe(1000000);
    expect(holding?.currentValueCents).toBe(1200000);
    expect(holding?.profitCents).toBe(200000);
  });
});
