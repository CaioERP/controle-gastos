import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { connections, institutions, syncRuns } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import {
  evaluateConnectionHealth,
  getConnectionHealthDetail,
  listConnections,
  listSyncRuns,
} from './connections';

describe('queries / connections', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('listConnections e listSyncRuns executam sem erro', async () => {
    const conns = await listConnections(db);
    expect(Array.isArray(conns)).toBe(true);

    const runs = await listSyncRuns(db);
    expect(Array.isArray(runs)).toBe(true);
  });

  it('getConnectionHealthDetail retorna diagnóstico de saúde, pausa após 3 erros e dailyStats com 30 dias', async () => {
    const [inst] = await db.select().from(institutions).limit(1);
    const [conn] = await db
      .insert(connections)
      .values({
        provider: 'pluggy',
        institutionId: inst!.id,
        externalId: 'item-health-test',
        status: 'error',
        consentExpiresAt: new Date('2026-10-25T12:00:00Z'), // 10 dias a partir de 2026-10-15
        lastSyncedAt: new Date('2026-10-14T12:00:00Z'),
        lastError: 'Falha temporária no conector',
      })
      .returning();

    // 1 sucesso em 2026-10-12 (+12 criadas) seguido de 3 erros em 13, 14 e 15/10
    await db.insert(syncRuns).values([
      {
        connectionId: conn!.id,
        job: 'pluggy-sync',
        startedAt: new Date('2026-10-12T10:00:00Z'),
        finishedAt: new Date('2026-10-12T10:00:05Z'),
        status: 'success',
        stats: { created: 12, updated: 2 },
      },
      {
        connectionId: conn!.id,
        job: 'pluggy-sync',
        startedAt: new Date('2026-10-13T10:00:00Z'),
        finishedAt: new Date('2026-10-13T10:00:02Z'),
        status: 'error',
        error: 'Erro 1',
      },
      {
        connectionId: conn!.id,
        job: 'pluggy-sync',
        startedAt: new Date('2026-10-14T10:00:00Z'),
        finishedAt: new Date('2026-10-14T10:00:02Z'),
        status: 'error',
        error: 'Erro 2',
      },
      {
        connectionId: conn!.id,
        job: 'pluggy-sync',
        startedAt: new Date('2026-10-15T10:00:00Z'),
        finishedAt: new Date('2026-10-15T10:00:02Z'),
        status: 'error',
        error: 'Erro 3',
      },
    ]);

    const detail = await getConnectionHealthDetail(db, conn!.id, { today: '2026-10-15' });
    expect(detail).not.toBeNull();
    expect(detail!.health.consecutiveErrors).toBe(3);
    expect(detail!.health.isPausedByErrors).toBe(true);
    expect(detail!.health.consentExpiringSoon).toBe(true);
    expect(detail!.health.consentDaysRemaining).toBe(10);
    expect(detail!.health.consentExpired).toBe(false);
    expect(detail!.health.recommendedAction).toContain('3 falhas seguidas');

    expect(detail!.dailyStats).toHaveLength(30);
    const statOct12 = detail!.dailyStats.find((d) => d.date === '2026-10-12');
    expect(statOct12?.createdCount).toBe(12);
    const statOct15 = detail!.dailyStats.find((d) => d.date === '2026-10-15');
    expect(statOct15?.errorCount).toBe(1);

    // Avalia também consentimento expirado na função pura
    const expiredHealth = evaluateConnectionHealth(
      { status: 'active', consentExpiresAt: new Date('2026-10-10T12:00:00Z'), lastError: null },
      [],
      new Date('2026-10-15T12:00:00Z'),
    );
    expect(expiredHealth.consentExpired).toBe(true);
    expect(expiredHealth.recommendedAction).toContain('expirou');
  });
});
