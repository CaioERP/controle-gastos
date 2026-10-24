import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, invoices, transactions } from '@/server/db/schema';
import type { TxFilters } from '@/server/domain/filters';
import { addMonthsISO, monthStart, today } from '@/server/domain/dates';
import { txLive } from '@/server/ledger';

export type FutureInstallmentMonth = {
  month: string;
  totalCents: number;
  count: number;
};

/**
 * Parcelas projetadas dos próximos 12 meses, agrupadas pelo mês de referência da fatura.
 * opts.today: data de referência (padrão: hoje em São Paulo). Testes devem sempre informá-la.
 */
export async function getFutureInstallments(
  db: Db,
  f: Pick<TxFilters, 'institutionIds' | 'accountIds'> = {},
  opts: { today?: string } = {},
): Promise<FutureInstallmentMonth[]> {
  const currentMonth = monthStart(opts.today ?? today());
  const maxMonth = monthStart(addMonthsISO(currentMonth, 12));

  const monthExpr = sql<string>`coalesce(${invoices.referenceMonth}::text, to_char(${transactions.date}::date, 'YYYY-MM-01'))`;

  const conds = [
    txLive,
    eq(transactions.status, 'projected'),
    f.institutionIds?.length ? inArray(accounts.institutionId, f.institutionIds) : undefined,
    f.accountIds?.length ? inArray(transactions.accountId, f.accountIds) : undefined,
    sql`${monthExpr} >= ${currentMonth}`,
    sql`${monthExpr} <= ${maxMonth}`,
  ];

  const rows = await db
    .select({
      month: monthExpr,
      totalCents: sql<number>`coalesce(sum(abs(${transactions.amountCents})), 0)`,
      count: sql<number>`count(${transactions.id})`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .where(and(...conds.filter(Boolean)))
    .groupBy(monthExpr)
    .orderBy(asc(monthExpr));

  return rows.map((r) => ({
    month: r.month,
    totalCents: Number(r.totalCents ?? 0),
    count: Number(r.count ?? 0),
  }));
}
