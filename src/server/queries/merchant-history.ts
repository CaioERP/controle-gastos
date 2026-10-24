import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  categories,
  invoices,
  merchants,
  transactions,
} from '@/server/db/schema';
import { REPORTABLE_KINDS, type TxKind } from '@/server/domain/enums';
import type { TxFilters } from '@/server/domain/filters';
import { addMonthsISO, monthEnd, monthStart, today } from '@/server/domain/dates';
import { buildTxWhere, spendValue } from './base';
import { getBreakdown, type BreakdownItem } from './breakdown';
import { notSplitParent } from './split-filter';
import { escapeLike } from './search';

export type MerchantHistory = {
  merchant: {
    id: string;
    name: string;
    defaultCategory: { id: string; name: string; color: string } | null;
  };
  last12: { totalCents: number; count: number; averageCents: number };
  firstDate: string | null; // primeira compra (qualquer período)
  lastDate: string | null;
  monthly: Array<{ month: string; totalCents: number }>; // 12 meses, terminando no mês de hoje, com zeros
  byPaymentMethod: BreakdownItem[]; // últimos 12 meses
  byAccount: BreakdownItem[]; // últimos 12 meses
};

export async function getMerchantHistory(
  db: Db,
  merchantId: string,
  opts: { today?: string } = {},
): Promise<MerchantHistory | null> {
  const [m] = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      catId: categories.id,
      catName: categories.name,
      catColor: categories.color,
    })
    .from(merchants)
    .leftJoin(categories, eq(categories.id, merchants.defaultCategoryId))
    .where(eq(merchants.id, merchantId));

  if (!m) return null;

  const todayStr = opts.today ?? today();
  const from12m = monthStart(addMonthsISO(todayStr, -11));
  const to12m = monthEnd(todayStr);

  const filters12m: TxFilters = {
    from: from12m,
    to: to12m,
    merchantIds: [merchantId],
    kinds: [...REPORTABLE_KINDS] as TxKind[],
    basis: 'accrual',
  };

  const [last12Summary, dateRange, monthRows, byPaymentMethod, byAccount] = await Promise.all([
    db
      .select({
        totalCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
        count: sql<number>`count(case when ${transactions.kind} in ('expense','refund') then 1 end)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
      .where(buildTxWhere(filters12m, { forTotals: true })),

    db
      .select({
        minDate: sql<string | null>`min(${transactions.date})`,
        maxDate: sql<string | null>`max(${transactions.date})`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
      .where(
        and(
          isNull(transactions.deletedAt),
          notSplitParent,
          eq(accounts.isHidden, false),
          eq(transactions.merchantId, merchantId),
          inArray(transactions.kind, REPORTABLE_KINDS as never[]),
        ),
      ),

    db
      .select({
        month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
        totalCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
      .where(buildTxWhere(filters12m, { forTotals: true }))
      .groupBy(sql`to_char(${transactions.date}, 'YYYY-MM')`),

    getBreakdown(db, filters12m, 'paymentMethod'),
    getBreakdown(db, filters12m, 'account'),
  ]);

  const totalCents = Number(last12Summary[0]?.totalCents ?? 0);
  const count = Number(last12Summary[0]?.count ?? 0);
  const averageCents = count > 0 ? Math.round(totalCents / count) : 0;

  const monthMap = new Map<string, number>();
  for (const r of monthRows) {
    monthMap.set(r.month, Number(r.totalCents));
  }

  const monthly: Array<{ month: string; totalCents: number }> = [];
  for (let i = -11; i <= 0; i++) {
    const mStr = addMonthsISO(todayStr, i).slice(0, 7);
    monthly.push({
      month: mStr,
      totalCents: Math.max(0, monthMap.get(mStr) ?? 0),
    });
  }

  return {
    merchant: {
      id: m.id,
      name: m.name,
      defaultCategory: m.catId
        ? { id: m.catId, name: m.catName!, color: m.catColor! }
        : null,
    },
    last12: {
      totalCents,
      count,
      averageCents,
    },
    firstDate: dateRange[0]?.minDate ?? null,
    lastDate: dateRange[0]?.maxDate ?? null,
    monthly,
    byPaymentMethod,
    byAccount,
  };
}

export async function listMerchantsWithSpend(
  db: Db,
  opts: { today?: string; search?: string } = {},
): Promise<Array<{
  id: string;
  name: string;
  categoryName: string | null;
  totalCents: number;
  count: number;
  lastDate: string;
}>> {
  const todayStr = opts.today ?? today();
  const from12m = monthStart(addMonthsISO(todayStr, -11));
  const to12m = monthEnd(todayStr);

  const f: TxFilters = {
    from: from12m,
    to: to12m,
    kinds: [...REPORTABLE_KINDS] as TxKind[],
    basis: 'accrual',
  };

  let whereCond = and(
    buildTxWhere(f, { forTotals: true }),
    isNotNull(transactions.merchantId),
  );

  if (opts.search?.trim()) {
    const esc = escapeLike(opts.search.trim().toLowerCase());
    whereCond = and(whereCond, sql`lower(${merchants.name}) like ${'%' + esc + '%'}`);
  }

  const rows = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      categoryName: categories.name,
      totalCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
      count: sql<number>`count(case when ${transactions.kind} in ('expense','refund') then 1 end)`,
      lastDate: sql<string>`max(${transactions.date})`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .innerJoin(merchants, eq(merchants.id, transactions.merchantId))
    .leftJoin(categories, eq(categories.id, merchants.defaultCategoryId))
    .where(whereCond)
    .groupBy(merchants.id, merchants.name, categories.name)
    .having(sql`sum(${spendValue}) > 0`)
    .orderBy(desc(sql`sum(${spendValue})`));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryName: r.categoryName ?? null,
    totalCents: Number(r.totalCents),
    count: Number(r.count),
    lastDate: r.lastDate,
  }));
}
