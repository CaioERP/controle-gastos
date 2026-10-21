import { and, desc, eq, gte, lte } from 'drizzle-orm';
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
import { addMonthsISO, monthStart, today as getToday } from '@/server/domain/dates';
import {
  type AssetClass,
  type InvestmentIndexer,
  type InvestmentTxType,
  type Source,
} from '@/server/domain/enums';
import { ASSET_CLASS_LABELS } from '@/server/domain/labels';
import {
  chainTwrReturns,
  compoundBenchmarkRates,
  computeModifiedDietzMonthReturn,
  type MonthlyFlow,
  type MonthlyPortfolioSeriesPoint,
} from '@/server/investments/returns';

export const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  fixed_income: '#2563EB', // azul
  treasury: '#0D9488', // teal
  stocks: '#7C3AED', // roxo
  fii: '#D97706', // âmbar
  etf: '#059669', // esmeralda
  funds: '#4F46E5', // índigo
  crypto: '#F59E0B', // laranja
  pension: '#64748B', // ardósia
  other: '#71717A', // cinza
};

export type HoldingRow = {
  id: string;
  accountId: string;
  accountName: string;
  institutionId: string;
  institutionName: string;
  institutionColor: string;
  assetId: string;
  assetName: string;
  assetClass: AssetClass;
  ticker: string | null;
  indexer: InvestmentIndexer | null;
  rateBps: number | null;
  maturityDate: string | null;
  isTaxExempt: boolean;
  source: Source;
  quantity: string;
  averagePriceCents: number | null;
  investedCents: number;
  currentValueCents: number;
  netValueCents: number | null;
  profitCents: number;
  profitBps: number; // ex.: 1250 = +12,50%
  asOfDate: string;
};

export type AllocationSlice = {
  assetClass: AssetClass;
  label: string;
  totalCents: number;
  shareBps: number; // participação na carteira em bps (10000 = 100,00%)
  count: number;
  color: string;
};

export type InvestmentsOverview = {
  totals: {
    investedCents: number;
    currentValueCents: number;
    netValueCents: number;
    profitCents: number;
    profitBps: number;
    twr12mBps: number;
    cdi12mBps: number;
    percentOfCdi12m: number | null; // ex.: 108.5 (= 108,5% do CDI)
    income12mCents: number; // proventos recebidos nos últimos 12 meses
  };
  allocation: AllocationSlice[];
  holdings: HoldingRow[];
  performanceSeries: MonthlyPortfolioSeriesPoint[];
  institutions: Array<{ id: string; name: string; color: string }>;
  investmentAccounts: Array<{ id: string; name: string; institutionName: string }>;
};

export type HoldingDetail = HoldingRow & {
  transactions: Array<{
    id: string;
    type: InvestmentTxType;
    date: string;
    amountCents: number;
    quantity: string | null;
    unitPriceCents: number | null;
    feeCents: number;
    taxCents: number;
    description: string | null;
    source: Source;
  }>;
  recentPrices: Array<{
    date: string;
    priceCents: number;
    source: string;
  }>;
};

export async function getInvestmentsOverview(
  db: Db,
  filters?: { institutionId?: string; assetClass?: AssetClass; today?: string },
): Promise<InvestmentsOverview> {
  const todayStr = filters?.today ?? getToday();

  // 1. Busca todas as posições ativas de contas não ocultas
  const rows = await db
    .select({
      holding: holdings,
      asset: assets,
      account: accounts,
      institution: institutions,
    })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .innerJoin(institutions, eq(accounts.institutionId, institutions.id))
    .where(
      and(
        eq(holdings.isRedeemed, false),
        eq(accounts.isHidden, false),
        filters?.institutionId ? eq(institutions.id, filters.institutionId) : undefined,
      ),
    );

  const allHoldingRows: HoldingRow[] = rows.map(({ holding, asset, account, institution }) => {
    const profitCents = holding.profitCents ?? (holding.currentValueCents - holding.investedCents);
    const profitBps =
      holding.investedCents > 0
        ? Math.round(((holding.currentValueCents - holding.investedCents) / holding.investedCents) * 10000)
        : 0;

    return {
      id: holding.id,
      accountId: account.id,
      accountName: account.name,
      institutionId: institution.id,
      institutionName: institution.name,
      institutionColor: institution.color,
      assetId: asset.id,
      assetName: asset.name,
      assetClass: asset.assetClass,
      ticker: asset.ticker,
      indexer: asset.indexer,
      rateBps: asset.rateBps,
      maturityDate: asset.maturityDate,
      isTaxExempt: asset.isTaxExempt,
      source: holding.source,
      quantity: holding.quantity,
      averagePriceCents: holding.averagePriceCents,
      investedCents: holding.investedCents,
      currentValueCents: holding.currentValueCents,
      netValueCents: holding.netValueCents,
      profitCents,
      profitBps,
      asOfDate: holding.asOfDate,
    };
  });

  // Totais agregados da carteira
  const investedCents = allHoldingRows.reduce((sum, h) => sum + h.investedCents, 0);
  const currentValueCents = allHoldingRows.reduce((sum, h) => sum + h.currentValueCents, 0);
  const netValueCents = allHoldingRows.reduce((sum, h) => sum + (h.netValueCents ?? h.currentValueCents), 0);
  const profitCents = currentValueCents - investedCents;
  const profitBps =
    investedCents > 0 ? Math.round(((currentValueCents - investedCents) / investedCents) * 10000) : 0;

  // Alocação por classe de ativo
  const classTotals = new Map<AssetClass, { totalCents: number; count: number }>();
  for (const h of allHoldingRows) {
    const existing = classTotals.get(h.assetClass) ?? { totalCents: 0, count: 0 };
    existing.totalCents += h.currentValueCents;
    existing.count += 1;
    classTotals.set(h.assetClass, existing);
  }

  const allocation: AllocationSlice[] = Array.from(classTotals.entries())
    .map(([assetClass, data]) => ({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      totalCents: data.totalCents,
      shareBps: currentValueCents > 0 ? Math.round((data.totalCents / currentValueCents) * 10000) : 0,
      count: data.count,
      color: ASSET_CLASS_COLORS[assetClass] ?? '#71717A',
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  // Filtra posições pela classe de ativo se solicitado
  const filteredHoldings = filters?.assetClass
    ? allHoldingRows.filter((h) => h.assetClass === filters.assetClass)
    : allHoldingRows;
  filteredHoldings.sort((a, b) => b.currentValueCents - a.currentValueCents);

  // Proventos dos últimos 12 meses: mesma janela (mês atual + 11 anteriores) e valor líquido da aba "Proventos"
  const oneYearAgoStr = monthStart(addMonthsISO(todayStr, -11));
  const incomeTxs = await db
    .select({
      amountCents: investmentTransactions.amountCents,
      taxCents: investmentTransactions.taxCents,
      date: investmentTransactions.date,
    })
    .from(investmentTransactions)
    .innerJoin(accounts, eq(investmentTransactions.accountId, accounts.id))
    .where(
      and(
        eq(investmentTransactions.type, 'income'),
        eq(accounts.isHidden, false),
        filters?.institutionId ? eq(accounts.institutionId, filters.institutionId) : undefined,
        gte(investmentTransactions.date, oneYearAgoStr),
        lte(investmentTransactions.date, todayStr),
      ),
    );
  const income12mCents = incomeTxs.reduce((sum, tx) => sum + tx.amountCents - tx.taxCents, 0);

  // Instituições e contas de investimento disponíveis para filtros
  const allAccounts = await db
    .select({
      account: accounts,
      institution: institutions,
    })
    .from(accounts)
    .innerJoin(institutions, eq(accounts.institutionId, institutions.id))
    .where(eq(accounts.isHidden, false));

  const instMap = new Map<string, { id: string; name: string; color: string }>();
  const investmentAccounts: Array<{ id: string; name: string; institutionName: string }> = [];

  for (const { account, institution } of allAccounts) {
    if (account.type === 'investment') {
      investmentAccounts.push({
        id: account.id,
        name: account.name,
        institutionName: institution.name,
      });
      instMap.set(institution.id, {
        id: institution.id,
        name: institution.name,
        color: institution.color,
      });
    }
  }

  for (const h of allHoldingRows) {
    if (!instMap.has(h.institutionId)) {
      instMap.set(h.institutionId, {
        id: h.institutionId,
        name: h.institutionName,
        color: h.institutionColor,
      });
    }
  }

  const institutionsList = Array.from(instMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  investmentAccounts.sort((a, b) => a.name.localeCompare(b.name));

  // Série mensal de 12 meses para comparação com benchmarks
  const months: string[] = [];
  for (let m = 11; m >= 0; m--) {
    months.push(monthStart(addMonthsISO(todayStr, -m)));
  }

  const startDateIso = months[0] ?? oneYearAgoStr;

  const [snapshots, allTxs, benchmarks] = await Promise.all([
    db
      .select({
        date: netWorthSnapshots.date,
        investmentsCents: netWorthSnapshots.investmentsCents,
      })
      .from(netWorthSnapshots)
      .where(gte(netWorthSnapshots.date, addMonthsISO(startDateIso, -1)))
      .orderBy(netWorthSnapshots.date),
    db
      .select({
        date: investmentTransactions.date,
        type: investmentTransactions.type,
        amountCents: investmentTransactions.amountCents,
      })
      .from(investmentTransactions)
      .innerJoin(accounts, eq(investmentTransactions.accountId, accounts.id))
      .where(
        and(
          eq(accounts.isHidden, false),
          filters?.institutionId ? eq(accounts.institutionId, filters.institutionId) : undefined,
          gte(investmentTransactions.date, startDateIso),
        ),
      ),
    db
      .select({
        benchmark: benchmarkSeries.benchmark,
        date: benchmarkSeries.date,
        valueMicros: benchmarkSeries.valueMicros,
      })
      .from(benchmarkSeries)
      .where(gte(benchmarkSeries.date, startDateIso))
      .orderBy(benchmarkSeries.date),
  ]);

  const performanceSeries: MonthlyPortfolioSeriesPoint[] = [];
  const monthlyReturns: number[] = [];
  let previousEndVal = 0;

  const firstMonthPriorSnapshots = snapshots.filter((s) => s.date < startDateIso);
  if (firstMonthPriorSnapshots.length > 0) {
    previousEndVal = firstMonthPriorSnapshots[firstMonthPriorSnapshots.length - 1]?.investmentsCents ?? 0;
  }

  const currentMonthStart = monthStart(todayStr);

  for (let i = 0; i < months.length; i++) {
    const m = months[i]!;
    const nextMonthStart = monthStart(addMonthsISO(m, 1));

    // Determina valor final do mês
    let endVal: number;
    if (m === currentMonthStart) {
      endVal = currentValueCents;
    } else {
      const monthSnapshots = snapshots.filter((s) => s.date >= m && s.date < nextMonthStart);
      if (monthSnapshots.length > 0) {
        endVal = monthSnapshots[monthSnapshots.length - 1]?.investmentsCents ?? previousEndVal;
      } else {
        endVal = previousEndVal;
      }
    }

    const startVal = previousEndVal;
    previousEndVal = endVal;

    // Fluxos do mês
    const monthFlows: MonthlyFlow[] = allTxs
      .filter((tx) => tx.date >= m && tx.date < nextMonthStart)
      .map((tx) => ({
        date: tx.date,
        type: tx.type,
        amountCents: tx.amountCents,
      }));

    const [yStr = '2026', mStr = '01'] = m.split('-');
    const daysInMonth = new Date(Number(yStr), Number(mStr), 0).getDate();

    const monthReturn = computeModifiedDietzMonthReturn({
      month: m,
      daysInMonth,
      startValueCents: startVal,
      endValueCents: endVal,
      flows: monthFlows,
    });

    monthlyReturns.push(monthReturn);
    const cumulativePortfolioBps = chainTwrReturns(monthlyReturns).returnBps;

    // Benchmarks acumulados desde startDateIso até o final deste mês
    const cdiPoints = benchmarks.filter((b) => b.benchmark === 'cdi' && b.date >= startDateIso && b.date < nextMonthStart);
    const cumulativeCdiBps = compoundBenchmarkRates('cdi', cdiPoints).returnBps;

    const ipcaPoints = benchmarks.filter((b) => b.benchmark === 'ipca' && b.date >= startDateIso && b.date < nextMonthStart);
    const cumulativeIpcaBps = compoundBenchmarkRates('ipca', ipcaPoints).returnBps;

    const ibovPoints = benchmarks.filter((b) => b.benchmark === 'ibov' && b.date >= startDateIso && b.date < nextMonthStart);
    const cumulativeIbovBps = compoundBenchmarkRates('ibov', ibovPoints).returnBps;

    performanceSeries.push({
      month: m,
      portfolioReturnBps: Math.round(monthReturn * 10000),
      cumulativePortfolioBps,
      cumulativeCdiBps,
      cumulativeIpcaBps,
      cumulativeIbovBps,
    });
  }

  const lastPoint = performanceSeries[performanceSeries.length - 1];
  const twr12mBps = lastPoint ? lastPoint.cumulativePortfolioBps : 0;
  const cdi12mBps = lastPoint ? lastPoint.cumulativeCdiBps : 0;
  const percentOfCdi12m = cdi12mBps > 0 ? Number(((twr12mBps / cdi12mBps) * 100).toFixed(1)) : null;

  return {
    totals: {
      investedCents,
      currentValueCents,
      netValueCents,
      profitCents,
      profitBps,
      twr12mBps,
      cdi12mBps,
      percentOfCdi12m,
      income12mCents,
    },
    allocation,
    holdings: filteredHoldings,
    performanceSeries,
    institutions: institutionsList,
    investmentAccounts,
  };
}

export async function getHoldingDetail(db: Db, holdingId: string): Promise<HoldingDetail | null> {
  const [row] = await db
    .select({
      holding: holdings,
      asset: assets,
      account: accounts,
      institution: institutions,
    })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .innerJoin(institutions, eq(accounts.institutionId, institutions.id))
    .where(eq(holdings.id, holdingId))
    .limit(1);

  if (!row) {
    return null;
  }

  const { holding, asset, account, institution } = row;
  const profitCents = holding.profitCents ?? (holding.currentValueCents - holding.investedCents);
  const profitBps =
    holding.investedCents > 0
      ? Math.round(((holding.currentValueCents - holding.investedCents) / holding.investedCents) * 10000)
      : 0;

  const [txRows, priceRows] = await Promise.all([
    db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.holdingId, holdingId))
      .orderBy(investmentTransactions.date),
    db
      .select()
      .from(assetPrices)
      .where(eq(assetPrices.assetId, asset.id))
      .orderBy(assetPrices.date),
  ]);

  return {
    id: holding.id,
    accountId: account.id,
    accountName: account.name,
    institutionId: institution.id,
    institutionName: institution.name,
    institutionColor: institution.color,
    assetId: asset.id,
    assetName: asset.name,
    assetClass: asset.assetClass,
    ticker: asset.ticker,
    indexer: asset.indexer,
    rateBps: asset.rateBps,
    maturityDate: asset.maturityDate,
    isTaxExempt: asset.isTaxExempt,
    source: holding.source,
    quantity: holding.quantity,
    averagePriceCents: holding.averagePriceCents,
    investedCents: holding.investedCents,
    currentValueCents: holding.currentValueCents,
    netValueCents: holding.netValueCents,
    profitCents,
    profitBps,
    asOfDate: holding.asOfDate,
    transactions: txRows.reverse().map((t) => ({
      id: t.id,
      type: t.type,
      date: t.date,
      amountCents: t.amountCents,
      quantity: t.quantity,
      unitPriceCents: t.unitPriceCents,
      feeCents: t.feeCents,
      taxCents: t.taxCents,
      description: t.description,
      source: t.source,
    })),
    recentPrices: priceRows.reverse().slice(0, 30).map((p) => ({
      date: p.date,
      priceCents: p.priceCents,
      source: p.source,
    })),
  };
}

export type DividendItemRow = {
  id: string;
  date: string;
  holdingId: string;
  assetName: string;
  ticker: string | null;
  assetClass: AssetClass;
  institutionName: string;
  institutionColor: string;
  amountCents: number;
  taxCents: number;
  netAmountCents: number;
  description: string | null;
  source: Source;
};

export type DividendsOverview = {
  total12mCents: number;
  averageMonthlyCents: number;
  monthlyTotals: Array<{ month: string; totalCents: number }>; // últimos 12 meses
  items: DividendItemRow[];
};

export async function getDividendsOverview(
  db: Db,
  opts?: { institutionId?: string; today?: string },
): Promise<DividendsOverview> {
  const todayStr = opts?.today ?? getToday();

  const rows = await db
    .select({
      tx: investmentTransactions,
      holding: holdings,
      asset: assets,
      account: accounts,
      institution: institutions,
    })
    .from(investmentTransactions)
    .innerJoin(holdings, eq(investmentTransactions.holdingId, holdings.id))
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .innerJoin(accounts, eq(investmentTransactions.accountId, accounts.id))
    .innerJoin(institutions, eq(accounts.institutionId, institutions.id))
    .where(
      and(
        eq(investmentTransactions.type, 'income'),
        eq(accounts.isHidden, false),
        opts?.institutionId ? eq(institutions.id, opts.institutionId) : undefined,
      ),
    )
    .orderBy(desc(investmentTransactions.date));

  const items: DividendItemRow[] = rows.map(({ tx, asset, institution }) => ({
    id: tx.id,
    date: tx.date,
    holdingId: tx.holdingId,
    assetName: asset.name,
    ticker: asset.ticker,
    assetClass: asset.assetClass,
    institutionName: institution.name,
    institutionColor: institution.color,
    amountCents: tx.amountCents,
    taxCents: tx.taxCents,
    netAmountCents: tx.amountCents - tx.taxCents,
    description: tx.description,
    source: tx.source,
  }));

  const months: string[] = [];
  for (let m = 11; m >= 0; m--) {
    months.push(monthStart(addMonthsISO(todayStr, -m)));
  }

  const monthlyTotals = months.map((m) => {
    const nextM = monthStart(addMonthsISO(m, 1));
    const total = items
      .filter((item) => item.date >= m && item.date < nextM)
      .reduce((sum, item) => sum + item.netAmountCents, 0);
    return { month: m, totalCents: total };
  });

  const total12mCents = monthlyTotals.reduce((sum, m) => sum + m.totalCents, 0);
  const averageMonthlyCents = Math.round(total12mCents / 12);

  return {
    total12mCents,
    averageMonthlyCents,
    monthlyTotals,
    items,
  };
}

