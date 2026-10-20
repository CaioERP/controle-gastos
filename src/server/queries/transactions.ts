import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { transactions, transactionSources } from '@/server/db/schema';
import { TX_KINDS, type Source } from '@/server/domain/enums';
import type { TxFilters } from '@/server/domain/filters';
import { buildTxWhere } from './base';
import { notSplitParent } from './split-filter';
import {
  baseTransactionQuery,
  loadTagsByTransaction,
  toTransactionRow,
  toTransactionRows,
  type TransactionRow,
} from './transaction-row';

export type { TransactionRow, TransactionTag } from './transaction-row';

export type ListTransactionsPage = {
  cursor?: string;
  limit?: number;
};

export type ListTransactionsResult = {
  items: TransactionRow[];
  nextCursor: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(date: string, id: string): string {
  return Buffer.from(`${date}|${id}`).toString('base64url');
}

/** Cursor inválido ou adulterado retorna null: a listagem recomeça do início em vez de gerar erro no banco. */
export function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const [date, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (rest.length > 0 || !date || !id || !ISO_DATE.test(date) || !UUID.test(id)) return null;
    return { date, id };
  } catch {
    return null;
  }
}

export async function listTransactions(
  db: Db,
  f: TxFilters,
  page: ListTransactionsPage = {},
): Promise<ListTransactionsResult> {
  const limit = Math.min(Math.max(1, page.limit ?? 50), 200);
  const where = buildTxWhere(f, { forTotals: false, defaultKinds: TX_KINDS });

  const decoded = page.cursor ? decodeCursor(page.cursor) : null;
  const cursorCond = decoded
    ? or(
        sql`${transactions.date} < ${decoded.date}`,
        and(eq(transactions.date, decoded.date), sql`${transactions.id} < ${decoded.id}`),
      )
    : undefined;

  const rows = await baseTransactionQuery(db)
    .where(cursorCond ? and(where, cursorCond) : where)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: await toTransactionRows(db, pageRows),
    nextCursor: hasNextPage && last ? encodeCursor(last.date, last.id) : null,
  };
}

/**
 * Detalhe da transação. O `raw` das fontes não é exposto: o payload original
 * (ex.: Pluggy) traz documentos e nomes de terceiros e não deve chegar ao navegador.
 */
export type TransactionDetail = TransactionRow & {
  sources: Array<{ source: Source; externalId: string; fetchedAt: Date }>;
};

export async function getTransaction(db: Db, id: string): Promise<TransactionDetail | null> {
  if (!UUID.test(id)) return null;
  const [r] = await baseTransactionQuery(db).where(and(eq(transactions.id, id), isNull(transactions.deletedAt)));
  if (!r) return null;

  const [tagMap, sources] = await Promise.all([
    loadTagsByTransaction(db, [id]),
    db
      .select({
        source: transactionSources.source,
        externalId: transactionSources.externalId,
        fetchedAt: transactionSources.fetchedAt,
      })
      .from(transactionSources)
      .where(eq(transactionSources.transactionId, id)),
  ]);

  return { ...toTransactionRow(r, tagMap.get(id)), sources };
}

export async function getInstallmentGroup(db: Db, groupId: string): Promise<TransactionRow[]> {
  if (!UUID.test(groupId)) return [];
  const rows = await baseTransactionQuery(db)
    .where(and(eq(transactions.installmentGroupId, groupId), isNull(transactions.deletedAt), notSplitParent))
    .orderBy(transactions.installmentNumber, transactions.date);
  return toTransactionRows(db, rows);
}

export async function getSplitParts(db: Db, parentId: string): Promise<TransactionRow[]> {
  if (!UUID.test(parentId)) return [];
  const rows = await baseTransactionQuery(db)
    .where(and(eq(transactions.parentTransactionId, parentId), isNull(transactions.deletedAt)))
    .orderBy(transactions.id);
  return toTransactionRows(db, rows);
}

export async function getParentTransaction(db: Db, childIdOrParentId: string): Promise<TransactionRow | null> {
  if (!UUID.test(childIdOrParentId)) return null;
  const [child] = await db
    .select({ parentTransactionId: transactions.parentTransactionId })
    .from(transactions)
    .where(and(eq(transactions.id, childIdOrParentId), isNull(transactions.deletedAt)));
  const parentId = child?.parentTransactionId ?? childIdOrParentId;
  const [row] = await baseTransactionQuery(db).where(
    and(eq(transactions.id, parentId), isNull(transactions.deletedAt)),
  );
  if (!row) return null;
  const tagMap = await loadTagsByTransaction(db, [parentId]);
  return toTransactionRow(row, tagMap.get(parentId));
}

export async function getReviewCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.needsReview, true), isNull(transactions.deletedAt), notSplitParent));
  return Number(row?.count ?? 0);
}
