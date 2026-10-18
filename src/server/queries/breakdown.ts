import { desc, eq, sql } from 'drizzle-orm';
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
import type { Dimension, TxFilters } from '@/server/domain/filters';
import { buildTxWhere, dimensionSql, incomeValue, parentCategories, spendValue } from './base';

export type BreakdownItem = {
  key: string;
  label: string;
  color: string | null;
  totalCents: number;
  count: number;
};

export async function getBreakdown(
  db: Db,
  f: TxFilters,
  by: Dimension,
  measure: 'expense' | 'income' = 'expense'
): Promise<BreakdownItem[]> {
  const where = buildTxWhere(f, { forTotals: true });
  const valueExpr = measure === 'expense' ? spendValue : incomeValue;
  const dim = dimensionSql(by);

  let query = db
    .select({
      key: dim.key,
      label: dim.label,
      color: dim.color,
      totalCents: sql<number>`coalesce(sum(${valueExpr}), 0)`,
      count: sql<number>`count(${transactions.id})`,
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

  const rows = await query
    .where(where)
    .groupBy(...dim.groupBy)
    .orderBy(desc(sql`coalesce(sum(${valueExpr}), 0)`));

  const items: BreakdownItem[] = [];
  for (const r of rows) {
    const totalCents = Number(r.totalCents ?? 0);
    if (totalCents <= 0) continue;

    const label = dim.mapLabel ? dim.mapLabel(r.key, r.label) : r.label;
    items.push({
      key: r.key,
      label,
      color: r.color ?? null,
      totalCents,
      count: Number(r.count ?? 0),
    });
  }

  return items;
}
