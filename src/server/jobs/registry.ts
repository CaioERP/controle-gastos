import { and, eq, isNull, ne } from 'drizzle-orm';
import { categorizeWithLlm } from '@/server/categorization/llm';
import { triggerSync } from '@/server/commands/sync';
import type { Db } from '@/server/db/client';
import { invoices, syncRuns, transactions } from '@/server/db/schema';
import { today } from '@/server/domain/dates';
import { checkConnectionsLifecycle } from '@/server/ingestion/connection-lifecycle';
import { computeInvoiceStatus } from '@/server/ingestion/invoices';
import { captureNetWorthSnapshot } from '@/server/investments/net-worth';
import { updateMarketPricesAndBenchmarks } from '@/server/investments/update-prices';

export type JobName =
  | 'sync-all'
  | 'categorize-pending'
  | 'invoice-status'
  | 'connection-health'
  | 'prices-daily'
  | 'net-worth-snapshot';

export type JobDef = {
  name: JobName;
  intervalMinutes: number;
  run: (db: Db) => Promise<Record<string, unknown>>;
};

export const JOBS: JobDef[] = [
  {
    name: 'sync-all',
    intervalMinutes: 360,
    run: async (db) => {
      const res = await triggerSync(db, { connectionId: null });
      await captureNetWorthSnapshot(db);
      return res;
    },
  },
  {
    name: 'categorize-pending',
    intervalMinutes: 60,
    run: async (db) => {
      const pending = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.needsReview, true),
            isNull(transactions.categoryId),
            isNull(transactions.deletedAt),
          ),
        );
      return categorizeWithLlm(
        db,
        pending.map((r) => r.id),
      );
    },
  },
  {
    name: 'invoice-status',
    intervalMinutes: 720,
    run: async (db) => {
      const todayStr = today();
      const unpaid = await db
        .select({
          id: invoices.id,
          closingDate: invoices.closingDate,
          dueDate: invoices.dueDate,
          paidAt: invoices.paidAt,
          status: invoices.status,
        })
        .from(invoices)
        .where(ne(invoices.status, 'paid'));

      let updated = 0;
      const now = new Date();
      for (const inv of unpaid) {
        const nextStatus = computeInvoiceStatus(
          {
            closingDate: inv.closingDate,
            dueDate: inv.dueDate,
            paidAt: inv.paidAt,
          },
          todayStr,
        );
        if (nextStatus !== inv.status) {
          await db
            .update(invoices)
            .set({ status: nextStatus, updatedAt: now })
            .where(eq(invoices.id, inv.id));
          updated++;
        }
      }
      return { checked: unpaid.length, updated };
    },
  },
  {
    name: 'connection-health',
    intervalMinutes: 1440,
    run: (db) => checkConnectionsLifecycle(db),
  },
  {
    name: 'prices-daily',
    intervalMinutes: 1440,
    run: async (db) => {
      const stats = await updateMarketPricesAndBenchmarks(db);
      await captureNetWorthSnapshot(db);
      return stats;
    },
  },
  {
    name: 'net-worth-snapshot',
    intervalMinutes: 1440,
    run: async (db) => {
      const nw = await captureNetWorthSnapshot(db);
      return nw as unknown as Record<string, unknown>;
    },
  },
];

export async function runJob(
  db: Db,
  name: JobName,
  jobs: JobDef[] = JOBS,
): Promise<{ syncRunId: string; result: Record<string, unknown> }> {
  const job = jobs.find((j) => j.name === name);
  if (!job) {
    throw new Error(`Job desconhecido: ${name}`);
  }

  const startedAt = new Date();
  const [runRow] = await db
    .insert(syncRuns)
    .values({
      connectionId: null,
      job: name,
      startedAt,
      status: 'running',
    })
    .returning({ id: syncRuns.id });

  const syncRunId = runRow!.id;

  try {
    const result = await job.run(db);
    await db
      .update(syncRuns)
      .set({
        finishedAt: new Date(),
        status: 'success',
        stats: result,
      })
      .where(eq(syncRuns.id, syncRunId));
    return { syncRunId, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(syncRuns)
      .set({
        finishedAt: new Date(),
        status: 'error',
        error: message,
      })
      .where(eq(syncRuns.id, syncRunId));
    throw err;
  }
}
