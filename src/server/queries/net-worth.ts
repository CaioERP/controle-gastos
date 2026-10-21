import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  holdings,
  institutions,
  invoices,
  netWorthSnapshots,
  transactions,
} from '@/server/db/schema';
import { addMonthsISO, monthStart, today as getToday } from '@/server/domain/dates';
import {
  computeNetWorth,
  type NetWorthComputation,
} from '@/server/investments/net-worth';

export type NetWorthMonthlyPoint = {
  month: string; // YYYY-MM-01
  cashAccountsCents: number;
  investmentsCents: number;
  liabilitiesCents: number; // positivo (openInvoices + futureInstallments)
  netWorthCents: number;
};

export type NetWorthOverview = {
  current: {
    date: string;
    cashAccountsCents: number;
    investmentsCents: number;
    openInvoicesCents: number;
    futureInstallmentsCents: number;
    assetsCents: number;
    liabilitiesCents: number;
    netWorthCents: number;
  };
  changes: {
    monthDeltaCents: number | null;
    monthDeltaBps: number | null;
    yearDeltaCents: number | null;
    yearDeltaBps: number | null;
  };
  monthlySeries: NetWorthMonthlyPoint[];
  byInstitution: Array<{
    institutionId: string;
    name: string;
    color: string;
    cashCents: number;
    investmentsCents: number;
    liabilitiesCents: number;
    netCents: number;
  }>;
};

export async function getNetWorthOverview(
  db: Db,
  opts?: { today?: string },
): Promise<NetWorthOverview> {
  const todayStr = opts?.today ?? getToday();

  // 1. Calcula o patrimônio em tempo real hoje
  const currentComputation: NetWorthComputation = await computeNetWorth(db, todayStr);

  // 2. Busca instituições e contas para enriquecer byInstitution
  const [instRows, accRows, holdingRows, invRows, projectedTxs] = await Promise.all([
    db.select().from(institutions),
    db
      .select()
      .from(accounts)
      .where(and(eq(accounts.includeInTotals, true), eq(accounts.isHidden, false))),
    db
      .select({
        holding: holdings,
      })
      .from(holdings)
      .where(eq(holdings.isRedeemed, false)),
    db.select().from(invoices),
    db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'projected'),
          isNull(transactions.deletedAt),
          isNull(transactions.parentTransactionId),
        ),
      ),
  ]);

  const accMap = new Map<string, (typeof accRows)[number]>();
  for (const acc of accRows) {
    accMap.set(acc.id, acc);
  }

  // Decomposição detalhada por instituição
  const instDecompMap = new Map<
    string,
    {
      institutionId: string;
      name: string;
      color: string;
      cashCents: number;
      investmentsCents: number;
      liabilitiesCents: number;
    }
  >();

  for (const inst of instRows) {
    instDecompMap.set(inst.id, {
      institutionId: inst.id,
      name: inst.name,
      color: inst.color,
      cashCents: 0,
      investmentsCents: 0,
      liabilitiesCents: 0,
    });
  }

  // Saldos de caixa por instituição
  for (const acc of accRows) {
    if (['checking', 'savings', 'wallet', 'benefit'].includes(acc.type)) {
      const item = instDecompMap.get(acc.institutionId);
      if (item) {
        item.cashCents += acc.balanceCents;
      }
    }
  }

  // Investimentos por instituição
  const holdingAccountIds = new Set<string>();
  for (const { holding } of holdingRows) {
    const acc = accMap.get(holding.accountId);
    if (acc) {
      holdingAccountIds.add(acc.id);
      const item = instDecompMap.get(acc.institutionId);
      if (item) {
        item.investmentsCents += holding.currentValueCents;
      }
    }
  }

  // Contas de investimento sem holdings detalhadas
  for (const acc of accRows) {
    if (acc.type === 'investment' && !holdingAccountIds.has(acc.id)) {
      const item = instDecompMap.get(acc.institutionId);
      if (item) {
        item.investmentsCents += Math.max(0, acc.balanceCents);
      }
    }
  }

  // Dívidas de cartão por instituição (mesma regra do computeNetWorth)
  const cardAccounts = accRows.filter((a) => a.type === 'credit_card');
  const invoicesByAccount = new Map<string, typeof invRows>();
  for (const inv of invRows) {
    const list = invoicesByAccount.get(inv.accountId) ?? [];
    list.push(inv);
    invoicesByAccount.set(inv.accountId, list);
  }

  const currentOpenByAccount = new Map<string, (typeof invRows)[number]>();
  for (const cardAcc of cardAccounts) {
    const accInvs = invoicesByAccount.get(cardAcc.id) ?? [];
    const openInvs = accInvs
      .filter((i) => i.status === 'open')
      .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));
    if (openInvs[0]) {
      currentOpenByAccount.set(cardAcc.id, openInvs[0]);
    }

    const closedOrOverdue = accInvs
      .filter((i) => i.status === 'closed' || i.status === 'overdue')
      .reduce((sum, i) => sum + Math.max(0, i.totalCents), 0);
    const openAmount = Math.max(0, openInvs[0]?.totalCents ?? 0);

    const item = instDecompMap.get(cardAcc.institutionId);
    if (item) {
      item.liabilitiesCents += closedOrOverdue + openAmount;
    }
  }

  // Parcelas futuras por instituição
  const invoiceMap = new Map(invRows.map((i) => [i.id, i]));
  for (const tx of projectedTxs) {
    const acc = accMap.get(tx.accountId);
    if (!acc) continue;

    const cardOpen = currentOpenByAccount.get(tx.accountId);
    if (cardOpen && tx.invoiceId === cardOpen.id) continue;
    if (cardOpen && tx.invoiceId) {
      const inv = invoiceMap.get(tx.invoiceId);
      if (inv && inv.referenceMonth <= cardOpen.referenceMonth) continue;
    }

    const item = instDecompMap.get(acc.institutionId);
    if (item) {
      item.liabilitiesCents += Math.abs(tx.amountCents);
    }
  }

  const byInstitution = Array.from(instDecompMap.values())
    .map((item) => ({
      ...item,
      netCents: item.cashCents + item.investmentsCents - item.liabilitiesCents,
    }))
    .filter((item) => item.cashCents !== 0 || item.investmentsCents !== 0 || item.liabilitiesCents !== 0)
    .sort((a, b) => b.netCents - a.netCents);

  // 3. Monta a série histórica mensal dos últimos 12 meses
  const months: string[] = [];
  for (let m = 11; m >= 0; m--) {
    months.push(monthStart(addMonthsISO(todayStr, -m)));
  }

  const startDateIso = months[0] ?? addMonthsISO(todayStr, -12);

  const snapshotRows = await db
    .select()
    .from(netWorthSnapshots)
    .where(gte(netWorthSnapshots.date, addMonthsISO(startDateIso, -1)))
    .orderBy(asc(netWorthSnapshots.date));

  const currentMonthStart = monthStart(todayStr);

  const fullSeries: Array<NetWorthMonthlyPoint | null> = months.map((m) => {
    if (m === currentMonthStart) {
      return {
        month: m,
        cashAccountsCents: currentComputation.cashAccountsCents,
        investmentsCents: currentComputation.investmentsCents,
        liabilitiesCents: currentComputation.liabilitiesCents,
        netWorthCents: currentComputation.netWorthCents,
      };
    }

    const nextM = monthStart(addMonthsISO(m, 1));
    const monthSnaps = snapshotRows.filter((s) => s.date >= m && s.date < nextM);

    if (monthSnaps.length > 0) {
      const lastSnap = monthSnaps[monthSnaps.length - 1]!;
      return {
        month: m,
        cashAccountsCents: lastSnap.cashAccountsCents,
        investmentsCents: lastSnap.investmentsCents,
        liabilitiesCents: lastSnap.liabilitiesCents,
        netWorthCents: lastSnap.netWorthCents,
      };
    }

    // Se não houver snapshot no mês, procura o último snapshot anterior
    const priorSnaps = snapshotRows.filter((s) => s.date < m);
    if (priorSnaps.length > 0) {
      const fallbackSnap = priorSnaps[priorSnaps.length - 1]!;
      return {
        month: m,
        cashAccountsCents: fallbackSnap.cashAccountsCents,
        investmentsCents: fallbackSnap.investmentsCents,
        liabilitiesCents: fallbackSnap.liabilitiesCents,
        netWorthCents: fallbackSnap.netWorthCents,
      };
    }

    // Antes do primeiro snapshot não há histórico: o mês fica fora da série (não é patrimônio R$ 0)
    return null;
  });

  const firstWithData = fullSeries.findIndex((pt) => pt !== null);
  const monthlySeries: NetWorthMonthlyPoint[] = fullSeries
    .slice(firstWithData === -1 ? fullSeries.length : firstWithData)
    .filter((pt): pt is NetWorthMonthlyPoint => pt !== null);

  // 4. Variação no mês e no ano
  // Mês anterior: penúltimo elemento de monthlySeries
  const prevMonthPoint = monthlySeries[monthlySeries.length - 2];
  let monthDeltaCents: number | null = null;
  let monthDeltaBps: number | null = null;

  if (prevMonthPoint && prevMonthPoint.netWorthCents !== 0) {
    monthDeltaCents = currentComputation.netWorthCents - prevMonthPoint.netWorthCents;
    monthDeltaBps = Math.round((monthDeltaCents / Math.abs(prevMonthPoint.netWorthCents)) * 10000);
  }

  // Variação no ano: compara com dezembro do ano anterior ou primeiro ponto do ano
  const currentYear = todayStr.slice(0, 4);
  const prevYearDec = `${parseInt(currentYear, 10) - 1}-12-01`;
  const decPoint = monthlySeries.find((pt) => pt.month === prevYearDec);
  const firstYearPoint = decPoint ?? monthlySeries.find((pt) => pt.month.startsWith(currentYear));

  let yearDeltaCents: number | null = null;
  let yearDeltaBps: number | null = null;

  if (firstYearPoint && firstYearPoint !== monthlySeries[monthlySeries.length - 1] && firstYearPoint.netWorthCents !== 0) {
    yearDeltaCents = currentComputation.netWorthCents - firstYearPoint.netWorthCents;
    yearDeltaBps = Math.round((yearDeltaCents / Math.abs(firstYearPoint.netWorthCents)) * 10000);
  }

  return {
    current: {
      date: currentComputation.date,
      cashAccountsCents: currentComputation.cashAccountsCents,
      investmentsCents: currentComputation.investmentsCents,
      openInvoicesCents: currentComputation.openInvoicesCents,
      futureInstallmentsCents: currentComputation.futureInstallmentsCents,
      assetsCents: currentComputation.assetsCents,
      liabilitiesCents: currentComputation.liabilitiesCents,
      netWorthCents: currentComputation.netWorthCents,
    },
    changes: {
      monthDeltaCents,
      monthDeltaBps,
      yearDeltaCents,
      yearDeltaBps,
    },
    monthlySeries,
    byInstitution,
  };
}
