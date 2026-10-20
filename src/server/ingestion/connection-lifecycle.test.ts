import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { reconnectConnection } from '@/server/commands/connections';
import { triggerSync } from '@/server/commands/sync';
import { connections, syncRuns } from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import { createPluggyAdapter } from '@/server/ingestion/pluggy/adapter';
import { createFakePluggyApi } from '@/server/ingestion/pluggy/fake';
import { createTestDb } from '../../../tests/helpers/db';
import {
  checkConnectionsLifecycle,
  evaluateConnectionHealth,
} from './connection-lifecycle';

describe('evaluateConnectionHealth (A2-05)', () => {
  const now = new Date('2026-04-15T12:00:00Z');

  it('3 execuções seguidas com error → isPausedByErrors: true e recommendedAction preenchida', () => {
    const health = evaluateConnectionHealth(
      {
        status: 'error',
        consentExpiresAt: new Date('2026-08-01T12:00:00Z'),
        lastError: 'Falha de login',
      },
      [{ status: 'error' }, { status: 'error' }, { status: 'error' }, { status: 'success' }],
      now,
    );

    expect(health.consecutiveErrors).toBe(3);
    expect(health.isPausedByErrors).toBe(true);
    expect(health.recommendedAction).toMatch(/pausada após 3 falhas seguidas/i);
  });

  it('2 error seguidos de 1 success anterior → consecutiveErrors: 2, isPausedByErrors: false', () => {
    const health = evaluateConnectionHealth(
      {
        status: 'error',
        consentExpiresAt: new Date('2026-08-01T12:00:00Z'),
        lastError: 'Falha temporária',
      },
      [{ status: 'error' }, { status: 'error' }, { status: 'success' }, { status: 'error' }],
      now,
    );

    expect(health.consecutiveErrors).toBe(2);
    expect(health.isPausedByErrors).toBe(false);
    expect(health.recommendedAction).toMatch(/última sincronização falhou/i);
  });

  it('consentExpiresAt daqui a 10 dias → consentExpiringSoon: true', () => {
    const health = evaluateConnectionHealth(
      {
        status: 'active',
        consentExpiresAt: new Date('2026-04-25T12:00:00Z'),
        lastError: null,
      },
      [{ status: 'success' }],
      now,
    );

    expect(health.consentDaysRemaining).toBe(10);
    expect(health.consentExpiringSoon).toBe(true);
    expect(health.consentExpired).toBe(false);
    expect(health.recommendedAction).toMatch(/expira em 10 dias/i);
  });

  it('consentExpiresAt ontem → consentExpired: true', () => {
    const health = evaluateConnectionHealth(
      {
        status: 'active',
        consentExpiresAt: new Date('2026-04-14T12:00:00Z'),
        lastError: null,
      },
      [{ status: 'success' }],
      now,
    );

    expect(health.consentExpired).toBe(true);
    expect(health.consentExpiringSoon).toBe(false);
    expect(health.recommendedAction).toMatch(/consentimento do Open Finance expirou/i);
  });
});

describe('checkConnectionsLifecycle, triggerSync e reconnectConnection no banco (A2-05)', () => {
  it('checkConnectionsLifecycle marca conexão vencida como expired', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const now = new Date('2026-04-15T12:00:00Z');

    const [conn] = await db
      .insert(connections)
      .values({
        provider: 'pluggy',
        externalId: 'item-expired-1',
        status: 'active',
        consentExpiresAt: new Date('2026-04-10T12:00:00Z'),
      })
      .returning({ id: connections.id });

    const stats = await checkConnectionsLifecycle(db, now);
    expect(stats.checked).toBe(1);
    expect(stats.markedExpired).toBe(1);

    const [updated] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, conn!.id));
    expect(updated?.status).toBe('expired');
    expect(updated?.lastError).toBe('Consentimento Open Finance expirado');
  });

  it('triggerSync({ connectionId: null }) pula conexão com 3 erros seguidos ou expirada', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const now = new Date('2026-04-15T12:00:00Z');

    const [pausedConn] = await db
      .insert(connections)
      .values({
        provider: 'pluggy',
        externalId: 'item-paused-3-errors',
        status: 'error',
        consentExpiresAt: new Date('2026-08-01T12:00:00Z'),
        lastError: 'Erro 3',
      })
      .returning({ id: connections.id });

    for (let i = 0; i < 3; i++) {
      await db.insert(syncRuns).values({
        connectionId: pausedConn!.id,
        job: 'pluggy-sync',
        status: 'error',
        error: `Falha ${i + 1}`,
        startedAt: new Date(now.getTime() - (3 - i) * 60_000),
        finishedAt: new Date(now.getTime() - (3 - i) * 60_000 + 1000),
      });
    }

    const [expiredConn] = await db
      .insert(connections)
      .values({
        provider: 'pluggy',
        externalId: 'item-expired-2',
        status: 'expired',
        consentExpiresAt: new Date('2026-04-01T12:00:00Z'),
      })
      .returning({ id: connections.id });

    const fakePluggy = createFakePluggyApi({
      items: [
        { id: 'item-paused-3-errors', status: 'UPDATED' },
        { id: 'item-expired-2', status: 'UPDATED' },
      ],
    });

    await triggerSync(
      db,
      { connectionId: null },
      { adapter: createPluggyAdapter(fakePluggy), now },
    );

    const pausedRuns = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.connectionId, pausedConn!.id));
    // Continua com apenas as 3 execuções antigas (não rodou nova)
    expect(pausedRuns).toHaveLength(3);

    const expiredRuns = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.connectionId, expiredConn!.id));
    expect(expiredRuns).toHaveLength(0);
  });

  it('reconnectConnection limpa lastError, atualiza consentExpiresAt e volta a sincronizar com sucesso no fake', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [conn] = await db
      .insert(connections)
      .values({
        provider: 'pluggy',
        externalId: 'item-reconnect-1',
        status: 'expired',
        consentExpiresAt: new Date('2026-04-01T12:00:00Z'),
        lastError: 'Consentimento Open Finance expirado',
      })
      .returning({ id: connections.id });

    const newConsentIso = '2027-04-15T12:00:00.000Z';
    const fakePluggy = createFakePluggyApi({
      items: [
        {
          id: 'item-reconnect-1',
          status: 'UPDATED',
          connector: { id: 201, name: 'Itaú' },
          consentExpiresAt: newConsentIso,
        },
      ],
      accounts: [
        {
          id: 'acc-rec-1',
          itemId: 'item-reconnect-1',
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          name: 'Conta Itaú',
          balance: 1500,
          currencyCode: 'BRL',
        },
      ],
      transactions: [],
    });

    const token = await fakePluggy.createConnectToken('item-reconnect-1');
    expect(token).toContain('item-reconnect-1');

    const res = await reconnectConnection(
      db,
      { connectionId: conn!.id },
      { pluggy: fakePluggy },
    );

    expect(res.connectionId).toBe(conn!.id);
    expect(res.syncRunId).toBeTruthy();

    const [updated] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, conn!.id));
    expect(updated?.status).toBe('active');
    expect(updated?.lastError).toBeNull();
    expect(updated?.consentExpiresAt?.toISOString()).toBe(newConsentIso);
  });
});
