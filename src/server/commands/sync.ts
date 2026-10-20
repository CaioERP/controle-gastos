import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { connections, syncRuns } from '@/server/db/schema';
import { CommandError, toCommandError } from '@/server/domain/errors';
import { evaluateConnectionHealth } from '@/server/ingestion/connection-lifecycle';
import { createPluggyAdapter } from '@/server/ingestion/pluggy/adapter';
import { getPluggyApi } from '@/server/ingestion/pluggy/client';
import { syncConnection } from '@/server/ingestion/sync';
import type { SourceAdapter } from '@/server/ingestion/types';

const triggerSyncInput = z.object({
  connectionId: z.string().uuid().nullable(),
});

const STUCK_SYNC_MS = 30 * 60 * 1000;

export type TriggerSyncDeps = {
  adapter?: SourceAdapter;
  today?: string;
  now?: Date;
};

/**
 * Dispara sincronização de uma conexão específica (`connectionId` informado) ou de todas as
 * conexões elegíveis (`active`, `error`, ou `syncing` há mais de 30 minutos).
 * Retorna o `syncRunId` da última execução.
 */
export async function triggerSync(
  db: Db,
  input: z.infer<typeof triggerSyncInput>,
  deps: TriggerSyncDeps = {},
): Promise<{ syncRunId: string }> {
  const { connectionId } = triggerSyncInput.parse(input);
  const adapter = deps.adapter ?? createPluggyAdapter(getPluggyApi());

  try {
    if (connectionId !== null) {
      const [conn] = await db
        .select({ id: connections.id, status: connections.status })
        .from(connections)
        .where(eq(connections.id, connectionId));

      if (conn?.status === 'revoked') {
        throw new CommandError(
          'CONFLICT',
          'Esta conexão foi revogada. Reconecte a conta antes de sincronizar.',
        );
      }

      const res = await syncConnection(db, connectionId, { adapter, today: deps.today });
      return { syncRunId: res.syncRunId };
    }

    const now = deps.now ?? new Date();
    const stuckThreshold = new Date(now.getTime() - STUCK_SYNC_MS);

    const candidates = await db
      .select({
        id: connections.id,
        status: connections.status,
        consentExpiresAt: connections.consentExpiresAt,
        lastError: connections.lastError,
      })
      .from(connections)
      .where(
        or(
          inArray(connections.status, ['active', 'error']),
          and(eq(connections.status, 'syncing'), lt(connections.updatedAt, stuckThreshold)),
        ),
      )
      .orderBy(asc(connections.createdAt), asc(connections.id));

    const eligible: Array<{ id: string }> = [];
    for (const conn of candidates) {
      if (conn.status === 'expired' || conn.status === 'revoked') continue;

      const recentRuns = await db
        .select({ status: syncRuns.status })
        .from(syncRuns)
        .where(eq(syncRuns.connectionId, conn.id))
        .orderBy(desc(syncRuns.startedAt), desc(syncRuns.id))
        .limit(5);

      const health = evaluateConnectionHealth(
        {
          status: conn.status,
          consentExpiresAt: conn.consentExpiresAt,
          lastError: conn.lastError,
        },
        recentRuns,
        now,
      );

      if (health.isPausedByErrors || health.consentExpired) {
        continue;
      }

      eligible.push({ id: conn.id });
    }

    if (eligible.length === 0) {
      const [emptyRun] = await db
        .insert(syncRuns)
        .values({
          connectionId: null,
          job: 'pluggy-sync',
          status: 'success',
          stats: { connections: 0, accounts: 0, created: 0, updated: 0, deleted: 0 },
          finishedAt: new Date(),
        })
        .returning({ id: syncRuns.id });
      return { syncRunId: emptyRun!.id };
    }

    let lastSyncRunId = '';
    for (const conn of eligible) {
      const res = await syncConnection(db, conn.id, { adapter, today: deps.today });
      lastSyncRunId = res.syncRunId;
    }

    return { syncRunId: lastSyncRunId };
  } catch (err) {
    throw toCommandError(err);
  }
}
