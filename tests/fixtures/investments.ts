import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  assetPrices,
  assets,
  benchmarkSeries,
  holdings,
  institutions,
  investmentTransactions,
  netWorthSnapshots,
} from '@/server/db/schema';
import { addDaysISO, addMonthsISO, monthStart, today as getToday } from '@/server/domain/dates';

export type InvestmentFixturesOptions = {
  referenceDate?: string;
  institutionId?: string;
};

export async function loadInvestmentFixtures(
  tx: Db,
  opts: InvestmentFixturesOptions = {},
): Promise<{ investmentAccountId: string }> {
  const refDate = opts.referenceDate ?? getToday();

  // Garante a instituição Nubank ou a fornecida
  let institutionId = opts.institutionId;
  if (!institutionId) {
    const [inst] = await tx
      .select({ id: institutions.id })
      .from(institutions)
      .limit(1);
    institutionId = inst?.id ?? randomUUID();
  }

  // 1. Conta de investimentos
  const invAccountId = randomUUID();
  await tx.insert(accounts).values({
    id: invAccountId,
    institutionId,
    type: 'investment',
    name: 'Nubank Investimentos',
    currency: 'BRL',
    balanceCents: 0,
    includeInTotals: true,
  });

  // 2. Criação dos 5 ativos
  const assetSpecs = [
    {
      code: 'TESOURO:TESOURO SELIC 2029:2029-03-01',
      ticker: null,
      name: 'Tesouro Selic 2029',
      assetClass: 'treasury' as const,
      indexer: 'selic' as const,
      rateBps: 10000,
      maturityDate: '2029-03-01',
      isTaxExempt: false,
      quantity: '1.50000000',
      investedCents: 2000000, // R$ 20.000,00
      currentValueCents: 2150000, // R$ 21.500,00
      quotePriceCents: 1433333,
    },
    {
      code: 'MANUAL:cdb-nubank-100-cdi',
      ticker: null,
      name: 'CDB Nubank 100% CDI',
      assetClass: 'fixed_income' as const,
      indexer: 'cdi' as const,
      rateBps: 10000,
      maturityDate: '2027-12-31',
      isTaxExempt: false,
      quantity: '1.00000000',
      investedCents: 1500000, // R$ 15.000,00
      currentValueCents: 1580000, // R$ 15.800,00
      quotePriceCents: 1580000,
    },
    {
      code: 'B3:PETR4',
      ticker: 'PETR4',
      name: 'Petróleo Brasileiro S.A. Petrobras',
      assetClass: 'stocks' as const,
      indexer: null,
      rateBps: null,
      maturityDate: null,
      isTaxExempt: false,
      quantity: '200.00000000',
      investedCents: 760000, // R$ 7.600,00 (preço médio 38,00)
      currentValueCents: 823600, // 200 x 41,18 = R$ 8.236,00
      quotePriceCents: 4118,
    },
    {
      code: 'B3:HGLG11',
      ticker: 'HGLG11',
      name: 'CSHG Logística FII',
      assetClass: 'fii' as const,
      indexer: null,
      rateBps: null,
      maturityDate: null,
      isTaxExempt: true,
      quantity: '100.00000000',
      investedCents: 1550000, // R$ 15.500,00 (preço médio 155,00)
      currentValueCents: 1620000, // 100 x 162,00 = R$ 16.200,00
      quotePriceCents: 16200,
    },
    {
      code: 'B3:IVVB11',
      ticker: 'IVVB11',
      name: 'iShares S&P 500 Fundo de Índice',
      assetClass: 'etf' as const,
      indexer: null,
      rateBps: null,
      maturityDate: null,
      isTaxExempt: false,
      quantity: '50.00000000',
      investedCents: 1400000, // R$ 14.000,00 (preço médio 280,00)
      currentValueCents: 1550000, // 50 x 310,00 = R$ 15.500,00
      quotePriceCents: 31000,
    },
  ];

  let totalInvestmentsBalanceCents = 0;
  const holdingIdsByTicker: Record<string, string> = {};

  for (const spec of assetSpecs) {
    const assetId = randomUUID();
    await tx.insert(assets).values({
      id: assetId,
      code: spec.code,
      ticker: spec.ticker,
      name: spec.name,
      assetClass: spec.assetClass,
      indexer: spec.indexer,
      rateBps: spec.rateBps,
      maturityDate: spec.maturityDate,
      isTaxExempt: spec.isTaxExempt,
    });

    const holdingId = randomUUID();
    await tx.insert(holdings).values({
      id: holdingId,
      accountId: invAccountId,
      assetId,
      source: 'manual',
      externalId: `fixture-h-${spec.ticker ?? spec.assetClass}`,
      quantity: spec.quantity,
      investedCents: spec.investedCents,
      currentValueCents: spec.currentValueCents,
      profitCents: spec.currentValueCents - spec.investedCents,
      averagePriceCents: spec.quotePriceCents,
      asOfDate: refDate,
      isRedeemed: false,
    });

    totalInvestmentsBalanceCents += spec.currentValueCents;

    if (spec.ticker) {
      holdingIdsByTicker[spec.ticker] = holdingId;
    }

    if (spec.quotePriceCents) {
      await tx.insert(assetPrices).values({
        id: randomUUID(),
        assetId,
        date: refDate,
        priceCents: spec.quotePriceCents,
        source: 'manual',
      });
    }
  }

  // Atualiza saldo da conta de investimentos
  await tx
    .update(accounts)
    .set({
      balanceCents: totalInvestmentsBalanceCents,
      balanceUpdatedAt: new Date(),
    })
    .where(eq(accounts.id, invAccountId));

  // 3. Proventos (income): PETR4 e HGLG11
  const petr4HoldingId = holdingIdsByTicker['PETR4'];
  const hglg11HoldingId = holdingIdsByTicker['HGLG11'];

  if (petr4HoldingId) {
    // Provento há 2 meses e há 1 mês
    const d1 = addDaysISO(refDate, -60);
    const d2 = addDaysISO(refDate, -25);
    await tx.insert(investmentTransactions).values([
      {
        id: randomUUID(),
        holdingId: petr4HoldingId,
        accountId: invAccountId,
        source: 'manual',
        externalId: `fixture-inc-petr4-1`,
        type: 'income',
        date: d1,
        amountCents: 24000, // R$ 240,00
        description: 'Dividendo PETR4',
      },
      {
        id: randomUUID(),
        holdingId: petr4HoldingId,
        accountId: invAccountId,
        source: 'manual',
        externalId: `fixture-inc-petr4-2`,
        type: 'income',
        date: d2,
        amountCents: 18000, // R$ 180,00
        description: 'Juros sobre Capital Próprio PETR4',
      },
    ]);
  }

  if (hglg11HoldingId) {
    // Rendimentos mensais de FII
    const d1 = addDaysISO(refDate, -80);
    const d2 = addDaysISO(refDate, -50);
    const d3 = addDaysISO(refDate, -20);
    await tx.insert(investmentTransactions).values([
      {
        id: randomUUID(),
        holdingId: hglg11HoldingId,
        accountId: invAccountId,
        source: 'manual',
        externalId: `fixture-inc-hglg11-1`,
        type: 'income',
        date: d1,
        amountCents: 11000, // R$ 110,00
        description: 'Rendimento FII HGLG11',
      },
      {
        id: randomUUID(),
        holdingId: hglg11HoldingId,
        accountId: invAccountId,
        source: 'manual',
        externalId: `fixture-inc-hglg11-2`,
        type: 'income',
        date: d2,
        amountCents: 11000,
        description: 'Rendimento FII HGLG11',
      },
      {
        id: randomUUID(),
        holdingId: hglg11HoldingId,
        accountId: invAccountId,
        source: 'manual',
        externalId: `fixture-inc-hglg11-3`,
        type: 'income',
        date: d3,
        amountCents: 11000,
        description: 'Rendimento FII HGLG11',
      },
    ]);
  }

  // 4. Séries históricas de benchmarks (CDI, Selic, IPCA, Ibov)
  const benchmarkRows = [];
  // Últimos 6 meses
  for (let i = 180; i >= 0; i -= 5) {
    const dt = addDaysISO(refDate, -i);
    benchmarkRows.push(
      {
        id: randomUUID(),
        benchmark: 'cdi' as const,
        date: dt,
        valueMicros: 410, // ~0.041% ao dia
      },
      {
        id: randomUUID(),
        benchmark: 'selic' as const,
        date: dt,
        valueMicros: 410,
      },
      {
        id: randomUUID(),
        benchmark: 'ibov' as const,
        date: dt,
        valueMicros: 12850000 + (180 - i) * 1500, // pontos x 100
      },
    );
  }

  // IPCA no dia 01 de cada mês
  for (let m = 6; m >= 0; m--) {
    const mDate = monthStart(addMonthsISO(refDate, -m));
    benchmarkRows.push({
      id: randomUUID(),
      benchmark: 'ipca' as const,
      date: mDate,
      valueMicros: 3800, // 0.38% ao mês
    });
  }

  for (const b of benchmarkRows) {
    await tx
      .insert(benchmarkSeries)
      .values(b)
      .onConflictDoUpdate({
        target: [benchmarkSeries.benchmark, benchmarkSeries.date],
        set: { valueMicros: b.valueMicros },
      });
  }

  // 5. 6 snapshots mensais em net_worth_snapshots
  const baseAssets = 6500000;
  const baseLiab = 800000;

  for (let m = 5; m >= 0; m--) {
    const snapDate = addDaysISO(monthStart(addMonthsISO(refDate, -m)), 14); // meio do mês
    const assetsCents = baseAssets + (5 - m) * 250000;
    const liabilitiesCents = baseLiab + (5 - m) * 40000;
    const netWorthCents = assetsCents - liabilitiesCents;

    await tx
      .insert(netWorthSnapshots)
      .values({
        id: randomUUID(),
        date: snapDate,
        cashAccountsCents: 1500000 + (5 - m) * 50000,
        investmentsCents: assetsCents - (1500000 + (5 - m) * 50000),
        openInvoicesCents: 500000,
        futureInstallmentsCents: liabilitiesCents - 500000,
        assetsCents,
        liabilitiesCents,
        netWorthCents,
        breakdown: {
          byAssetClass: {
            treasury: 2150000,
            fixed_income: 1580000,
            stocks: 823600,
            fii: 1620000,
            etf: 1550000,
          },
        },
      })
      .onConflictDoUpdate({
        target: [netWorthSnapshots.date],
        set: {
          assetsCents,
          liabilitiesCents,
          netWorthCents,
        },
      });
  }

  return { investmentAccountId: invAccountId };
}
