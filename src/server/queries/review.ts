import { and, desc, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, transactions } from '@/server/db/schema';
import { accountVisible, txLive } from '@/server/ledger';
import { baseTransactionQuery, toTransactionRows, type TransactionRow } from './transaction-row';
import { decodeCursor, encodeCursor } from './transactions';

export type ReviewQueuePage = { items: TransactionRow[]; nextCursor: string | null };

/**
 * Mesmo critério de `getReviewCount`: needsReview e não excluída, de qualquer data ou natureza,
 * em conta visível. A mãe de uma divisão ativa sai da fila (as partes entram no lugar).
 */
const reviewWhere = and(eq(transactions.needsReview, true), txLive, accountVisible);

/**
 * Fila de revisão, da mais recente para a mais antiga, paginada por cursor (mesmo formato de listTransactions).
 * Não aplica período nem contas ocultas, para a fila bater com o contador do menu.
 */
export async function listReviewQueue(
  db: Db,
  page: { cursor?: string; limit?: number } = {},
): Promise<ReviewQueuePage> {
  const limit = Math.min(Math.max(1, page.limit ?? 30), 200);
  const decoded = page.cursor ? decodeCursor(page.cursor) : null;
  const cursorCond = decoded
    ? or(
        sql`${transactions.date} < ${decoded.date}`,
        and(eq(transactions.date, decoded.date), sql`${transactions.id} < ${decoded.id}`),
      )
    : undefined;

  const rows = await baseTransactionQuery(db)
    .where(cursorCond ? and(reviewWhere, cursorCond) : reviewWhere)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return {
    items: await toTransactionRows(db, pageRows),
    nextCursor: hasNext && last ? encodeCursor(last.date, last.id) : null,
  };
}

export type ReviewSuggestion = { transactionId: string; categoryId: string; confidence: number };

/**
 * Sugestões automáticas (IA ou fonte) da fila com confiança mínima — base do "confirmar todas".
 * Só naturezas que aceitam categoria (R8).
 */
export async function listReviewSuggestions(db: Db, minConfidence: number): Promise<ReviewSuggestion[]> {
  const rows = await db
    .select({
      transactionId: transactions.id,
      categoryId: transactions.categoryId,
      confidence: transactions.categoryConfidence,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        reviewWhere,
        inArray(transactions.categorySource, ['llm', 'provider']),
        inArray(transactions.kind, ['expense', 'income', 'refund']),
        isNotNull(transactions.categoryId),
        gte(transactions.categoryConfidence, minConfidence),
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.id));
  return rows.map((r) => ({ transactionId: r.transactionId, categoryId: r.categoryId!, confidence: r.confidence! }));
}
