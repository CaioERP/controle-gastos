import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, connections, institutions, syncRuns } from '@/server/db/schema';
import type { ConnectionStatus, Source } from '@/server/domain/enums';

export type ConnectionRow = {
  id: string;
  provider: Source;
  externalId: string;
  status: ConnectionStatus;
  institution: { id: string; name: string; color: string; slug: string } | null;
  lastSyncedAt: Date | null;
  consentExpiresAt: Date | null;
  lastError: string | null;
  accountCount: number;
  lastRun: {
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    stats: unknown;
  } | null;
};

export async function listConnections(db: Db): Promise<ConnectionRow[]> {
  const rows = await db
    .select({
      id: connections.id,
      provider: connections.provider,
      externalId: connections.externalId,
      status: connections.status,
      institutionId: institutions.id,
      institutionName: institutions.name,
      institutionColor: institutions.color,
      institutionSlug: institutions.slug,
      lastSyncedAt: connections.lastSyncedAt,
      consentExpiresAt: connections.consentExpiresAt,
      lastError: connections.lastError,
      accountCount: sql<number>`count(${accounts.id})`,
    })
    .from(connections)
    .leftJoin(institutions, eq(institutions.id, connections.institutionId))
    .leftJoin(accounts, eq(accounts.connectionId, connections.id))
    .groupBy(connections.id, institutions.id)
    .orderBy(desc(connections.createdAt));

  // Busca a última execução de sync para cada conexão
  const runs = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt));

  const runByConn = new Map<string, typeof runs[0]>();
  for (const r of runs) {
    if (r.connectionId && !runByConn.has(r.connectionId)) {
      runByConn.set(r.connectionId, r);
    }
  }

  return rows.map((c) => {
    const lr = runByConn.get(c.id);
    return {
      id: c.id,
      provider: c.provider,
      externalId: c.externalId,
      status: c.status,
      institution: c.institutionId
        ? {
            id: c.institutionId,
            name: c.institutionName!,
            color: c.institutionColor!,
            slug: c.institutionSlug!,
          }
        : null,
      lastSyncedAt: c.lastSyncedAt,
      consentExpiresAt: c.consentExpiresAt,
      lastError: c.lastError,
      accountCount: Number(c.accountCount ?? 0),
      lastRun: lr
        ? {
            status: lr.status,
            startedAt: lr.startedAt,
            finishedAt: lr.finishedAt,
            stats: lr.stats,
          }
        : null,
    };
  });
}

export type SyncRunRow = {
  id: string;
  connectionId: string | null;
  job: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  stats: unknown;
  error: string | null;
};

export async function listSyncRuns(
  db: Db,
  opts: { connectionId?: string; limit?: number } = {}
): Promise<SyncRunRow[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);

  const where = opts.connectionId ? eq(syncRuns.connectionId, opts.connectionId) : undefined;

  const rows = await db
    .select()
    .from(syncRuns)
    .where(where)
    .orderBy(desc(syncRuns.startedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    connectionId: r.connectionId,
    job: r.job,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    status: r.status,
    stats: r.stats,
    error: r.error,
  }));
}
