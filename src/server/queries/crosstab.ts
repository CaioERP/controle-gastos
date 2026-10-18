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
import type { Dimension, TxFilters } from '@/server/domain/filters';
import { buildTxWhere, dimensionSql, incomeValue, parentCategories, spendValue } from './base';

export type Bucket = {
  key: string;
  label: string;
  color: string | null;
  totalCents: number;
};

export type CrossTabResult = {
  rows: Bucket[];
  cols: Bucket[];
  cells: Record<string, Record<string, number>>;
};

/**
 * Tabela cruzada entre duas dimensões. Células com total zero são omitidas; negativas são mantidas
 * para que a soma das células seja igual ao total de getSpendingSummary.
 */
export async function getCrossTab(
  db: Db,
  f: TxFilters,
  rowsDim: Dimension,
  colsDim: Dimension,
  measure: 'expense' | 'income' = 'expense'
): Promise<CrossTabResult> {
  const where = buildTxWhere(f, { forTotals: true });
  const valueExpr = measure === 'expense' ? spendValue : incomeValue;
  const rowSql = dimensionSql(rowsDim);
  const colSql = dimensionSql(colsDim);

  let query = db
    .select({
      rowKey: rowSql.key,
      rowLabel: rowSql.label,
      rowColor: rowSql.color,
      colKey: colSql.key,
      colLabel: colSql.label,
      colColor: colSql.color,
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

  if (rowsDim === 'tag' || colsDim === 'tag') {
    query = query
      .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
      .innerJoin(tags, eq(tags.id, transactionTags.tagId));
  }

  const dbRows = await query
    .where(where)
    .groupBy(...rowSql.groupBy, ...colSql.groupBy);

  const rowBucketsMap = new Map<string, Bucket>();
  const colBucketsMap = new Map<string, Bucket>();
  const cells: Record<string, Record<string, number>> = {};

  for (const r of dbRows) {
    const totalCents = Number(r.totalCents ?? 0);
    if (totalCents === 0) continue;

    const rowKey = r.rowKey;
    const colKey = r.colKey;
    const rowLabel = rowSql.mapLabel ? rowSql.mapLabel(rowKey, r.rowLabel) : r.rowLabel;
    const colLabel = colSql.mapLabel ? colSql.mapLabel(colKey, r.colLabel) : r.colLabel;

    // Acumula row bucket
    const existingRow = rowBucketsMap.get(rowKey);
    if (existingRow) {
      existingRow.totalCents += totalCents;
    } else {
      rowBucketsMap.set(rowKey, {
        key: rowKey,
        label: rowLabel,
        color: r.rowColor ?? null,
        totalCents,
      });
    }

    // Acumula col bucket
    const existingCol = colBucketsMap.get(colKey);
    if (existingCol) {
      existingCol.totalCents += totalCents;
    } else {
      colBucketsMap.set(colKey, {
        key: colKey,
        label: colLabel,
        color: r.colColor ?? null,
        totalCents,
      });
    }

    // Preenche célula
    if (!cells[rowKey]) cells[rowKey] = {};
    cells[rowKey][colKey] = (cells[rowKey][colKey] ?? 0) + totalCents;
  }

  const rows = Array.from(rowBucketsMap.values()).sort((a, b) => b.totalCents - a.totalCents);
  const cols = Array.from(colBucketsMap.values()).sort((a, b) => b.totalCents - a.totalCents);

  return { rows, cols, cells };
}
