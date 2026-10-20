import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { connections, syncRuns, transactions, transactionSources } from '@/server/db/schema';
import { addDaysISO, today as getToday, TZ } from '@/server/domain/dates';
import { resolveInstitution } from './institutions';
import { upsertAccount, upsertTransaction } from './persist';
import { runPipeline } from './pipeline';
import type { RawInvoice, SourceAdapter } from './types';

export type SyncResult = {
  syncRunId: string;
  status: 'success' | 'error';
  stats: Record<string, number>;
  error?: string;
};

function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(
    /(?:Bearer\s+|api[_-]?key[=:\s]+|client[_-]?secret[=:\s]+|secret[=:\s]+|password[=:\s]+|token[=:\s]+)[^\s,;]+/gi,
    '[REDACTED]',
  );
}

export async function syncConnection(
  db: Db,
  connectionId: string,
  deps: { adapter: SourceAdapter; today?: string },
): Promise<SyncResult> {
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));

  const [run] = await db
    .insert(syncRuns)
    .values({
      connectionId: conn ? conn.id : null,
      job: 'pluggy-sync',
      status: 'running',
      stats: {},
    })
    .returning({ id: syncRuns.id });

  const syncRunId = run!.id;
  const stats: Record<string, number> = {
    accounts: 0,
    created: 0,
    updated: 0,
    deleted: 0,
  };

  if (!conn) {
    const error = 'Conexão não encontrada';
    await db
      .update(syncRuns)
      .set({ status: 'error', finishedAt: new Date(), stats, error })
      .where(eq(syncRuns.id, syncRunId));
    return { syncRunId, status: 'error', stats, error };
  }

  await db
    .update(connections)
    .set({ status: 'syncing', updatedAt: new Date() })
    .where(eq(connections.id, conn.id));

  const todayStr = deps.today ?? getToday();
  const since = conn.lastSyncedAt
    ? addDaysISO(format(new TZDate(conn.lastSyncedAt, TZ), 'yyyy-MM-dd'), -7)
    : addDaysISO(todayStr, -365);

  const transactionIds: string[] = [];
  const accountIds: string[] = [];
  const invoicesByAccount: Record<string, RawInvoice[]> = {};

  try {
    const connRef = { id: conn.id, externalId: conn.externalId };
    const rawAccounts = await deps.adapter.listAccounts(connRef);

    for (const rawAccount of rawAccounts) {
      const normalizedTxs = await deps.adapter.listTransactions(connRef, rawAccount, since);

      let rawInvoices: RawInvoice[] | undefined;
      if (rawAccount.type === 'credit_card' && deps.adapter.listInvoices) {
        rawInvoices = await deps.adapter.listInvoices(connRef, rawAccount);
        stats.invoicesFetched = (stats.invoicesFetched ?? 0) + rawInvoices.length;
      }

      await db.transaction(async (tx) => {
        const inst = await resolveInstitution(tx, rawAccount.institutionName);
        const accountId = await upsertAccount(tx, conn.id, rawAccount, inst.id);
        accountIds.push(accountId);
        stats.accounts = (stats.accounts ?? 0) + 1;

        if (rawInvoices) {
          invoicesByAccount[accountId] = rawInvoices;
        }

        const fetchedExternalIds = new Set<string>();
        for (const nTx of normalizedTxs) {
          fetchedExternalIds.add(nTx.externalId);
          const res = await upsertTransaction(tx, accountId, nTx);
          if (res.created) {
            stats.created = (stats.created ?? 0) + 1;
            transactionIds.push(res.id);
          } else if (res.changed) {
            stats.updated = (stats.updated ?? 0) + 1;
            transactionIds.push(res.id);
          }
        }

        // Pendentes que sumiram na janela sincronizada → soft delete
        const pendingRows = await tx
          .select({
            id: transactions.id,
            externalId: transactionSources.externalId,
          })
          .from(transactions)
          .innerJoin(transactionSources, eq(transactionSources.transactionId, transactions.id))
          .where(
            and(
              eq(transactions.accountId, accountId),
              eq(transactions.status, 'pending'),
              gte(transactions.date, since),
              isNull(transactions.deletedAt),
              eq(transactionSources.source, deps.adapter.provider),
            ),
          );

        const disappearedIds = pendingRows
          .filter((r) => !fetchedExternalIds.has(r.externalId))
          .map((r) => r.id);

        if (disappearedIds.length > 0) {
          await tx
            .update(transactions)
            .set({ deletedAt: new Date() })
            .where(inArray(transactions.id, disappearedIds));
          stats.deleted = (stats.deleted ?? 0) + disappearedIds.length;
        }
      });
    }

    await runPipeline({
      db,
      transactionIds,
      accountIds,
      connectionId: conn.id,
      stats,
      invoicesByAccount,
      today: todayStr,
    });

    const now = deps.today
      ? new Date(new TZDate(`${deps.today}T12:00:00`, TZ).getTime())
      : new Date();
    await db
      .update(connections)
      .set({ status: 'active', lastSyncedAt: now, lastError: null, updatedAt: now })
      .where(eq(connections.id, conn.id));

    await db
      .update(syncRuns)
      .set({ status: 'success', finishedAt: now, stats })
      .where(eq(syncRuns.id, syncRunId));

    return { syncRunId, status: 'success', stats };
  } catch (err) {
    const error = sanitizeErrorMessage(err);
    const now = new Date();

    await db
      .update(connections)
      .set({ status: 'error', lastError: error, updatedAt: now })
      .where(eq(connections.id, conn.id));

    await db
      .update(syncRuns)
      .set({ status: 'error', finishedAt: now, stats, error })
      .where(eq(syncRuns.id, syncRunId));

    return { syncRunId, status: 'error', stats, error };
  }
}
