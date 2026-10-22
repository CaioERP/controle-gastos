import { eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, categories, invoices, transactions } from '@/server/db/schema';
import { addMonthsISO, monthEnd, monthStart, today as getToday } from '@/server/domain/dates';
import type { TxFilters } from '@/server/domain/filters';
import { buildTxWhere, effectiveDate, spendValue } from '@/server/queries/base';
import { percentChange } from '@/server/queries/stats';

export type PacePoint = {
  day: number; // 1..31
  currentCents: number | null; // acumulado do mês atual até este dia; null depois de hoje
  previousCents: number; // acumulado do mês anterior até este dia
};

/**
 * daily*: gasto de cada dia, chave = dia do mês (1..31).
 * Dias do mês anterior que não existem no atual (ex.: 31) são ignorados; dias do mês atual que
 * não existiam no anterior (ex.: 31 depois de um mês de 30) repetem o último acumulado anterior.
 */
export function buildPaceSeries(args: {
  currentDaily: Map<number, number>;
  previousDaily: Map<number, number>;
  daysInMonth: number;
  todayDay: number;
}): PacePoint[] {
  let runningPrev = 0;
  let runningCurrent = 0;
  const points: PacePoint[] = [];

  for (let d = 1; d <= args.daysInMonth; d++) {
    if (args.previousDaily.has(d)) {
      runningPrev += args.previousDaily.get(d)!;
    }

    if (d <= args.todayDay) {
      if (args.currentDaily.has(d)) {
        runningCurrent += args.currentDaily.get(d)!;
      }
    }

    points.push({
      day: d,
      currentCents: d <= args.todayDay ? runningCurrent : null,
      previousCents: runningPrev,
    });
  }

  return points;
}

export type SpendingPace = {
  points: PacePoint[];
  currentTotalCents: number; // acumulado até hoje
  previousSameDayCents: number; // acumulado do mês anterior até o mesmo dia
  variationPercent: number | null; // percentChange(current, previousSameDay) de queries/stats.ts
};

export async function getSpendingPace(
  db: Db,
  f: TxFilters,
  opts: { today?: string } = {},
): Promise<SpendingPace> {
  const todayStr = opts.today ?? getToday();
  const fromStr = f.from;

  const monthFrom = monthStart(fromStr);
  const monthTo = monthEnd(monthFrom);
  const daysInMonth = parseInt(monthTo.slice(8, 10), 10);

  const isCurrentMonth = monthFrom === monthStart(todayStr);
  const todayDay = isCurrentMonth
    ? parseInt(todayStr.slice(8, 10), 10)
    : daysInMonth;

  const prevMonthFrom = monthStart(addMonthsISO(monthFrom, -1));
  const prevMonthTo = monthEnd(prevMonthFrom);

  const dExpr = effectiveDate(f.basis);

  const currentWhere = buildTxWhere(
    { ...f, from: monthFrom, to: monthTo },
    { forTotals: true },
  );
  const currentRows = await db
    .select({
      date: dExpr,
      spentCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(currentWhere)
    .groupBy(dExpr);

  const prevWhere = buildTxWhere(
    { ...f, from: prevMonthFrom, to: prevMonthTo },
    { forTotals: true },
  );
  const prevRows = await db
    .select({
      date: dExpr,
      spentCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(prevWhere)
    .groupBy(dExpr);

  const currentDaily = new Map<number, number>();
  for (const r of currentRows) {
    if (r.date) {
      const day = parseInt(r.date.slice(8, 10), 10);
      currentDaily.set(day, (currentDaily.get(day) ?? 0) + Number(r.spentCents));
    }
  }

  const previousDaily = new Map<number, number>();
  for (const r of prevRows) {
    if (r.date) {
      const day = parseInt(r.date.slice(8, 10), 10);
      previousDaily.set(day, (previousDaily.get(day) ?? 0) + Number(r.spentCents));
    }
  }

  const points = buildPaceSeries({
    currentDaily,
    previousDaily,
    daysInMonth,
    todayDay,
  });

  const targetDay = Math.min(Math.max(todayDay, 1), daysInMonth);
  const pointAtDay = points[targetDay - 1];

  const currentTotalCents = pointAtDay?.currentCents ?? 0;
  const previousSameDayCents = pointAtDay?.previousCents ?? 0;
  const variationPercent = percentChange(currentTotalCents, previousSameDayCents);

  return {
    points,
    currentTotalCents,
    previousSameDayCents,
    variationPercent,
  };
}
