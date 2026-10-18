import { eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  categories,
  institutions,
  invoices,
  merchants,
  tags,
  transactions,
  transactionTags,
} from '@/server/db/schema';
import { addMonthsISO, monthStart } from '@/server/domain/dates';
import type { Dimension, TxFilters } from '@/server/domain/filters';
import { buildTxWhere, dimensionSql, effectiveDate, parentCategories, spendValue } from './base';

export type MonthlySeriesPoint = {
  month: string;
  values: Record<string, number>;
};

export type MonthlySeriesResult = MonthlySeriesPoint[] & {
  labels: Record<string, { label: string; color: string | null }>;
};

export async function getMonthlySeries(
  db: Db,
  f: TxFilters,
  by?: Dimension,
  opts: { top?: number } = { top: 6 }
): Promise<MonthlySeriesResult> {
  const where = buildTxWhere(f, { forTotals: true });
  const d = effectiveDate(f.basis);
  const monthExpr = sql<string>`to_char(${d}::date, 'YYYY-MM-01')`;

  // Gera lista cronológica de todos os meses no período
  const monthsList: string[] = [];
  let currMonth = monthStart(f.from);
  const endMonth = monthStart(f.to);
  while (currMonth <= endMonth) {
    monthsList.push(currMonth);
    currMonth = monthStart(addMonthsISO(currMonth, 1));
  }

  if (!by) {
    const rows = await db
      .select({
        month: monthExpr,
        totalCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
      .where(where)
      .groupBy(monthExpr);

    const monthTotals = new Map<string, number>();
    for (const r of rows) {
      monthTotals.set(r.month, Number(r.totalCents ?? 0));
    }

    const points: MonthlySeriesPoint[] = monthsList.map((m) => ({
      month: m,
      values: { total: monthTotals.get(m) ?? 0 },
    }));

    return Object.assign(points, {
      labels: { total: { label: 'Total', color: null } },
    });
  }

  const dim = dimensionSql(by);
  let query = db
    .select({
      month: monthExpr,
      dimKey: dim.key,
      dimLabel: dim.label,
      dimColor: dim.color,
      totalCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .leftJoin(institutions, eq(institutions.id, accounts.institutionId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(parentCategories, eq(parentCategories.id, categories.parentId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .$dynamic();

  if (by === 'tag') {
    query = query
      .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
      .innerJoin(tags, eq(tags.id, transactionTags.tagId));
  }

  const dbRows = await query
    .where(where)
    .groupBy(monthExpr, ...dim.groupBy);

  // Totais por chave no período para selecionar as top N
  const totalByKey = new Map<string, number>();
  const labelMap = new Map<string, { label: string; color: string | null }>();

  for (const r of dbRows) {
    const key = r.dimKey;
    const total = Number(r.totalCents ?? 0);
    totalByKey.set(key, (totalByKey.get(key) ?? 0) + total);

    if (!labelMap.has(key)) {
      const label = dim.mapLabel ? dim.mapLabel(key, r.dimLabel) : r.dimLabel;
      labelMap.set(key, { label, color: r.dimColor ?? null });
    }
  }

  const topN = opts.top ?? 6;
  const sortedKeys = Array.from(totalByKey.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const topKeys = new Set(sortedKeys.slice(0, topN));
  const hasOutros = sortedKeys.length > topN;

  // Mapa [mes][key] -> total
  const monthKeyTotals = new Map<string, Map<string, number>>();
  for (const r of dbRows) {
    if (!monthKeyTotals.has(r.month)) monthKeyTotals.set(r.month, new Map());
    const m = monthKeyTotals.get(r.month)!;
    const key = topKeys.has(r.dimKey) ? r.dimKey : 'outros';
    m.set(key, (m.get(key) ?? 0) + Number(r.totalCents ?? 0));
  }

  const points: MonthlySeriesPoint[] = monthsList.map((m) => {
    const mTotals = monthKeyTotals.get(m);
    const values: Record<string, number> = {};
    for (const key of topKeys) {
      values[key] = mTotals?.get(key) ?? 0;
    }
    if (hasOutros) {
      values['outros'] = mTotals?.get('outros') ?? 0;
    }
    return { month: m, values };
  });

  const resultLabels: Record<string, { label: string; color: string | null }> = {};
  for (const key of topKeys) {
    resultLabels[key] = labelMap.get(key)!;
  }
  if (hasOutros) {
    resultLabels['outros'] = { label: 'Outros', color: '#9CA3AF' };
  }

  return Object.assign(points, {
    labels: resultLabels,
  });
}
