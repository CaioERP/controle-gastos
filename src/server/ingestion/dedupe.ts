import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { transactionSources } from '@/server/db/schema';
import type { NormalizedTransaction } from './types';

export type CrossSourceMatchResult = {
  status: 'new' | 'fuzzy_duplicate' | 'ambiguous_duplicate';
  matchedTransactionId: string | null;
  candidates: Array<{
    transactionId: string;
    date: string;
    amountCents: number;
    description: string;
    similarity: number;
  }>;
};

/**
 * Stub de A2-01 (implementação completa na A2-03).
 */
export async function findCrossSourceMatches(
  db: Db,
  accountId: string,
  incoming: {
    source: 'pluggy' | 'file' | 'email';
    date: string;
    amountCents: number;
    descriptionRaw: string;
  },
): Promise<CrossSourceMatchResult> {
  void db;
  void accountId;
  void incoming;
  return { status: 'new', matchedTransactionId: null, candidates: [] };
}

export async function linkSourceToTransaction(
  db: Db,
  transactionId: string,
  n: NormalizedTransaction,
  opts?: { importBatchId?: string },
): Promise<void> {
  const [existing] = await db
    .select({ id: transactionSources.id })
    .from(transactionSources)
    .where(
      and(
        eq(transactionSources.source, n.source),
        eq(transactionSources.externalId, n.externalId),
      ),
    );

  if (existing) return;

  await db.insert(transactionSources).values({
    transactionId,
    source: n.source,
    externalId: n.externalId,
    raw: n.raw,
    fetchedAt: new Date(),
    importBatchId: opts?.importBatchId ?? null,
  });
}
