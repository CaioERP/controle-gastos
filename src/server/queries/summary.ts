import { eq, sql, type SQL } from 'drizzle-orm';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Db } from '@/server/db/client';
import { accounts, categories, invoices, transactions } from '@/server/db/schema';
import { addDaysISO, addMonthsISO, monthEnd } from '@/server/domain/dates';
import type { TxFilters } from '@/server/domain/filters';
import { buildTxWhere, incomeValue, spendValue } from './base';

export type SpendingSummary = {
  expenseCents: number;
  incomeCents: number;
  netCents: number;
  previousExpenseCents: number;
  previousIncomeCents: number;
};

/**
 * Calcula o intervalo anterior correspondente:
 * Se o período for um mês cheio (do dia 01 ao último dia do mês), retorna o mês anterior cheio.
 * Caso contrário, retorna o mesmo número de dias imediatamente anteriores.
 */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const isFullMonth = from.endsWith('-01') && to === monthEnd(from);
  if (isFullMonth) {
    const prevMonthFirst = addMonthsISO(from, -1);
    return {
      from: prevMonthFirst,
      to: monthEnd(prevMonthFirst),
    };
  }

  const daysCount = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  const prevTo = addDaysISO(from, -1);
  const prevFrom = addDaysISO(prevTo, -(daysCount - 1));
  return { from: prevFrom, to: prevTo };
}

export async function getSpendingSummary(db: Db, f: TxFilters): Promise<SpendingSummary> {
  const whereCurr = buildTxWhere(f, { forTotals: true });
  const prev = previousRange(f.from, f.to);
  const wherePrev = buildTxWhere({ ...f, from: prev.from, to: prev.to }, { forTotals: true });

  const queryTotals = (where: SQL) =>
    db
      .select({
        expenseCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
        incomeCents: sql<number>`coalesce(sum(${incomeValue}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(where);

  const [[curr], [previous]] = await Promise.all([queryTotals(whereCurr), queryTotals(wherePrev)]);

  const expenseCents = Number(curr?.expenseCents ?? 0);
  const incomeCents = Number(curr?.incomeCents ?? 0);
  const previousExpenseCents = Number(previous?.expenseCents ?? 0);
  const previousIncomeCents = Number(previous?.incomeCents ?? 0);

  return {
    expenseCents,
    incomeCents,
    netCents: incomeCents - expenseCents,
    previousExpenseCents,
    previousIncomeCents,
  };
}
