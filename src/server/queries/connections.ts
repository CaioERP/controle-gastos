import { asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, connections, institutions, syncRuns } from '@/server/db/schema';
import { addDaysISO, today } from '@/server/domain/dates';
import type { AccountType, ConnectionStatus, Source } from '@/server/domain/enums';
import {
  CONSENT_WARNING_DAYS,
  evaluateConnectionHealth,
  MAX_CONSECUTIVE_SYNC_ERRORS,
  type ConnectionHealth,
} from '@/server/ingestion/connection-lifecycle';

export {
  CONSENT_WARNING_DAYS,
  evaluateConnectionHealth,
  MAX_CONSECUTIVE_SYNC_ERRORS,
  type ConnectionHealth,
};

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
  health?: ConnectionHealth;
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

  // Busca as execuções de sync para cada conexão (ordenadas da mais recente para a mais antiga)
  const runs = await db
    .select()
    .from(syncRuns)
    .orderBy(desc(syncRuns.startedAt));

  const runsByConn = new Map<string, Array<typeof runs[0]>>();
  for (const r of runs) {
    if (!r.connectionId) continue;
    const list = runsByConn.get(r.connectionId) ?? [];
    list.push(r);
    runsByConn.set(r.connectionId, list);
  }

  return rows.map((c) => {
    const connRuns = runsByConn.get(c.id) ?? [];
    const lr = connRuns[0];
    const health = evaluateConnectionHealth(
      { status: c.status, consentExpiresAt: c.consentExpiresAt, lastError: c.lastError },
      connRuns,
    );
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
      health,
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

export type DailySyncStat = {
  date: string;       // YYYY-MM-DD (últimos 30 dias)
  createdCount: number;
  errorCount: number;
};

export type ConnectionHealthDetail = {
  connection: ConnectionRow;
  accounts: Array<{
    id: string;
    name: string;
    type: AccountType;
    balanceCents: number;
    balanceUpdatedAt: Date | null;
  }>;
  health: ConnectionHealth;
  runs: SyncRunRow[];
  dailyStats: DailySyncStat[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getConnectionHealthDetail(
  db: Db,
  connectionId: string,
  opts?: { today?: string },
): Promise<ConnectionHealthDetail | null> {
  if (!UUID_RE.test(connectionId)) {
    return null;
  }

  const [connRow] = await db
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
    })
    .from(connections)
    .leftJoin(institutions, eq(institutions.id, connections.institutionId))
    .where(eq(connections.id, connectionId));

  if (!connRow) {
    return null;
  }

  const [linkedAccounts, runs] = await Promise.all([
    db
      .select({
        id: accounts.id,
        name: accounts.name,
        displayName: accounts.displayName,
        type: accounts.type,
        balanceCents: accounts.balanceCents,
        balanceUpdatedAt: accounts.balanceUpdatedAt,
      })
      .from(accounts)
      .where(eq(accounts.connectionId, connectionId))
      .orderBy(asc(accounts.name)),
    listSyncRuns(db, { connectionId, limit: 50 }),
  ]);

  const todayStr = opts?.today ?? today();
  const refNow = opts?.today ? new Date(`${opts.today}T12:00:00Z`) : new Date();

  const health = evaluateConnectionHealth(
    {
      status: connRow.status,
      consentExpiresAt: connRow.consentExpiresAt,
      lastError: connRow.lastError,
    },
    runs,
    refNow,
  );

  const lr = runs[0];
  const connection: ConnectionRow = {
    id: connRow.id,
    provider: connRow.provider,
    externalId: connRow.externalId,
    status: connRow.status,
    institution: connRow.institutionId
      ? {
          id: connRow.institutionId,
          name: connRow.institutionName!,
          color: connRow.institutionColor!,
          slug: connRow.institutionSlug!,
        }
      : null,
    lastSyncedAt: connRow.lastSyncedAt,
    consentExpiresAt: connRow.consentExpiresAt,
    lastError: connRow.lastError,
    accountCount: linkedAccounts.length,
    lastRun: lr
      ? {
          status: lr.status,
          startedAt: lr.startedAt,
          finishedAt: lr.finishedAt,
          stats: lr.stats,
        }
      : null,
    health,
  };

  // Monta os últimos 30 dias (do mais antigo para o mais recente)
  const statsByDay = new Map<string, { createdCount: number; errorCount: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = addDaysISO(todayStr, -i);
    statsByDay.set(d, { createdCount: 0, errorCount: 0 });
  }

  for (const r of runs) {
    const dayStr = new Date(r.startedAt).toISOString().slice(0, 10);
    const bucket = statsByDay.get(dayStr);
    if (!bucket) continue;

    if (r.status === 'success') {
      const created = Number((r.stats as { created?: number } | null)?.created ?? 0);
      if (Number.isFinite(created) && created > 0) {
        bucket.createdCount += created;
      }
    } else if (r.status === 'error') {
      bucket.errorCount += 1;
    }
  }

  const dailyStats: DailySyncStat[] = Array.from(statsByDay.entries()).map(([date, vals]) => ({
    date,
    createdCount: vals.createdCount,
    errorCount: vals.errorCount,
  }));

  return {
    connection,
    accounts: linkedAccounts.map((a) => ({
      id: a.id,
      name: a.displayName ?? a.name,
      type: a.type,
      balanceCents: a.balanceCents,
      balanceUpdatedAt: a.balanceUpdatedAt,
    })),
    health,
    runs,
    dailyStats,
  };
}
