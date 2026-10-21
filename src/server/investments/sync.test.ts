import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  assets,
  connections,
  holdings,
  institutions,
  investmentTransactions,
  transactions,
} from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import type { PluggyInvestment, PluggyInvestmentTransaction } from '@/server/ingestion/pluggy/api';
import { createFakePluggyApi } from '@/server/ingestion/pluggy/fake';
import { getSpendingSummary } from '@/server/queries/summary';
import sampleInvestmentsFixture from '../../../tests/fixtures/pluggy/sample-investments.json';
import { syncConnectionInvestments } from './sync';

describe('investments sync', () => {
  async function setup() {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.slug, 'nubank'))
      .limit(1);

    const [conn] = await db
      .insert(connections)
      .values({
        provider: 'pluggy',
        institutionId: inst!.id,
        externalId: 'item-1',
      })
      .returning();


    const [checkingAcc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        connectionId: conn!.id,
        type: 'checking',
        name: 'Conta Corrente Nubank',
        balanceCents: 500000,
      })
      .returning();

    const fakePluggy = createFakePluggyApi({
      investments: sampleInvestmentsFixture.investments as unknown as PluggyInvestment[],
      investmentTransactions: sampleInvestmentsFixture.investmentTransactions as unknown as Record<
        string,
        PluggyInvestmentTransaction[]
      >,
    });

    return { db, inst: inst!, conn: conn!, checkingAcc: checkingAcc!, fakePluggy };
  }

  it('sincroniza investimentos e movimentações da Pluggy', async () => {
    const { db, conn, fakePluggy } = await setup();

    const result = await syncConnectionInvestments(db, conn.id, { pluggy: fakePluggy });

    expect(result.holdingsUpserted).toBe(4);
    expect(result.txUpserted).toBe(2);

    const allAssets = await db.select().from(assets);
    expect(allAssets).toHaveLength(4);

    const petr4 = allAssets.find((a) => a.ticker === 'PETR4');
    expect(petr4).toBeDefined();
    expect(petr4?.assetClass).toBe('stocks');
    expect(petr4?.code).toBe('B3:PETR4');

    const allHoldings = await db.select().from(holdings);
    expect(allHoldings).toHaveLength(4);

    const allTxs = await db.select().from(investmentTransactions);
    expect(allTxs).toHaveLength(2);

    // Conta de investimentos criada e com saldo somado
    const [invAcc] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.type, 'investment'));
    expect(invAcc).toBeDefined();
    // 10500 + 15200.5 + 4118 + 16200 = 46018.5 -> 4601850 centavos
    expect(invAcc?.balanceCents).toBe(4601850);
  });

  it('garante idempotência ao rodar 2 vezes', async () => {
    const { db, conn, fakePluggy } = await setup();

    await syncConnectionInvestments(db, conn.id, { pluggy: fakePluggy });
    await syncConnectionInvestments(db, conn.id, { pluggy: fakePluggy });

    const allAssets = await db.select().from(assets);
    const allHoldings = await db.select().from(holdings);
    const allTxs = await db.select().from(investmentTransactions);

    expect(allAssets).toHaveLength(4);
    expect(allHoldings).toHaveLength(4);
    expect(allTxs).toHaveLength(2);
  });

  it('preserva campos listados em user_edited_fields (R9)', async () => {
    const { db, conn, fakePluggy } = await setup();

    await syncConnectionInvestments(db, conn.id, { pluggy: fakePluggy });

    const [petr4Holding] = await db
      .select()
      .from(holdings)
      .where(eq(holdings.externalId, 'inv-petr4-1'));

    expect(petr4Holding).toBeDefined();

    // Usuário altera manualmente o valor atual
    await db
      .update(holdings)
      .set({
        currentValueCents: 555500,
        userEditedFields: ['currentValueCents'],
      })
      .where(eq(holdings.id, petr4Holding!.id));

    // Roda a sincronização novamente
    await syncConnectionInvestments(db, conn.id, { pluggy: fakePluggy });

    const [afterSyncHolding] = await db
      .select()
      .from(holdings)
      .where(eq(holdings.id, petr4Holding!.id));

    expect(afterSyncHolding?.currentValueCents).toBe(555500);
    // Lucro acompanha o valor editado, não o valor do Pluggy
    expect(afterSyncHolding?.profitCents).toBe(555500 - afterSyncHolding!.investedCents);
  });

  it('posição que some da resposta do Pluggy deixa de contar (resgatada)', async () => {
    const { db, conn, fakePluggy } = await setup();
    await syncConnectionInvestments(db, conn.id, { pluggy: fakePluggy });

    const remaining = (sampleInvestmentsFixture.investments as unknown as PluggyInvestment[]).filter(
      (inv) => inv.id !== 'inv-petr4-1',
    );
    await syncConnectionInvestments(db, conn.id, {
      pluggy: createFakePluggyApi({ investments: remaining }),
    });

    const [petr4] = await db.select().from(holdings).where(eq(holdings.externalId, 'inv-petr4-1'));
    expect(petr4?.isRedeemed).toBe(true);

    const [invAcc] = await db.select().from(accounts).where(eq(accounts.type, 'investment'));
    // 4601850 menos a posição de PETR4 (R$ 4.118,00)
    expect(invAcc?.balanceCents).toBe(4601850 - 411800);
  });

  it('vincula automaticamente aporte à transação da conta corrente sem duplicar gastos (R2)', async () => {
    const { db, conn, checkingAcc, fakePluggy } = await setup();

    // Transação de aplicação de R$ 1.000,00 na conta corrente
    const [checkingTx] = await db
      .insert(transactions)
      .values({
        accountId: checkingAcc.id,
        date: '2026-10-10',
        amountCents: -100000, // negativo = saída (R1)
        description: 'APLICACAO CDB INTER',
        descriptionRaw: 'APLICACAO CDB INTER',
        kind: 'investment',
        paymentMethod: 'pix',
        status: 'posted',
      })
      .returning();

    const result = await syncConnectionInvestments(db, conn.id, { pluggy: fakePluggy });
    expect(result.linkedCount).toBe(1);

    const [linkedInvTx] = await db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.externalId, 'inv-tx-cdb-buy-1'));

    expect(linkedInvTx?.linkedTransactionId).toBe(checkingTx!.id);

    // O aporte não deve aparecer no resumo de gastos (R2)
    const summary = await getSpendingSummary(db, {
      from: '2026-10-01',
      to: '2026-10-31',
      basis: 'accrual',
    });


    expect(summary.expenseCents).toBe(0);
  });
});
