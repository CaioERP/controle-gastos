import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { accounts, connections, institutions, invoices, syncRuns, transactions } from '../db/schema';
import { seedBase } from '../db/seed';
import { CommandError } from '../domain/errors';
import { createPluggyAdapter } from '../ingestion/pluggy/adapter';
import { createFakePluggyApi } from '../ingestion/pluggy/fake';
import { updateAccount } from './accounts';
import { registerConnection } from './connections';
import { triggerSync } from './sync';

describe('registerConnection, triggerSync e updateAccount (A1-01 / A1-08)', () => {
  it('registra conexão ativa, vincula instituição pelo connector, grava consentimento e dispara sync inicial', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const fakePluggy = createFakePluggyApi({
      items: [
        {
          id: 'item-nubank-123',
          status: 'UPDATED',
          connector: { id: 201, name: 'Nu Pagamentos S.A.' },
          consentExpiresAt: '2027-10-20T00:00:00.000Z',
          executionStatus: 'SUCCESS',
        },
      ],
      accounts: [
        {
          id: 'acc-nu-1',
          itemId: 'item-nubank-123',
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          name: 'Conta do Nubank',
          balance: 500,
        },
      ],
    });

    const { connectionId } = await registerConnection(
      db,
      { provider: 'pluggy', externalId: 'item-nubank-123' },
      { pluggy: fakePluggy },
    );

    const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
    expect(conn).toBeDefined();
    expect(conn!.provider).toBe('pluggy');
    expect(conn!.externalId).toBe('item-nubank-123');
    expect(conn!.status).toBe('active');
    expect(conn!.consentExpiresAt).toEqual(new Date('2027-10-20T00:00:00.000Z'));

    const [inst] = await db.select().from(institutions).where(eq(institutions.id, conn!.institutionId!));
    expect(inst).toBeDefined();
    expect(inst!.slug).toBe('nubank');

    const runs = await db.select().from(syncRuns).where(eq(syncRuns.connectionId, connectionId));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('success');
  });

  it('registrar de novo o mesmo item não duplica; falha na sync inicial mantém registro válido e grava erro em sync_runs', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const baseFake = createFakePluggyApi({
      items: [
        {
          id: 'item-itau-456',
          status: 'UPDATED',
          connector: { id: 202, name: 'Itaú Unibanco S.A.' },
        },
      ],
    });

    const failingSyncFake = {
      ...baseFake,
      async fetchAccounts() {
        throw new Error('Falha temporária ao listar contas');
      },
    };

    const res1 = await registerConnection(
      db,
      { provider: 'pluggy', externalId: 'item-itau-456' },
      { pluggy: failingSyncFake },
    );

    const [conn1] = await db.select().from(connections).where(eq(connections.id, res1.connectionId));
    expect(conn1).toBeDefined();
    expect(conn1!.status).toBe('error');

    const runs1 = await db.select().from(syncRuns).where(eq(syncRuns.connectionId, res1.connectionId));
    expect(runs1).toHaveLength(1);
    expect(runs1[0]!.status).toBe('error');

    // Segunda chamada com o mesmo item e sincronização funcionando
    const res2 = await registerConnection(
      db,
      { provider: 'pluggy', externalId: 'item-itau-456' },
      { pluggy: baseFake },
    );

    expect(res2.connectionId).toBe(res1.connectionId);

    const [conn2] = await db.select().from(connections).where(eq(connections.id, res1.connectionId));
    expect(conn2!.status).toBe('active');

    const allConns = await db.select().from(connections);
    expect(allConns).toHaveLength(1);
  });

  it('item inexistente na Pluggy lança CommandError com código EXTERNAL', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const fakePluggy = createFakePluggyApi({ items: [] });

    await expect(
      registerConnection(
        db,
        { provider: 'pluggy', externalId: 'item-inexistente' },
        { pluggy: fakePluggy },
      ),
    ).rejects.toThrow(CommandError);

    try {
      await registerConnection(
        db,
        { provider: 'pluggy', externalId: 'item-inexistente' },
        { pluggy: fakePluggy },
      );
    } catch (err) {
      const cmdErr = err as CommandError;
      expect(cmdErr.code).toBe('EXTERNAL');
      expect(cmdErr.message).toContain('Pluggy:');
    }
  });

  it('updateAccount reassocia faturas e recalcula totais quando closingDay ou dueDay mudam (A1-08)', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const [inst] = await db.select().from(institutions).limit(1);

    // Cartão começa com fechamento dia 15 e vencimento dia 22
    const [card] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'credit_card',
        name: 'Cartão Reassociação',
        closingDay: 15,
        dueDay: 22,
      })
      .returning();

    const [tx1, tx2] = await db
      .insert(transactions)
      .values([
        {
          accountId: card!.id,
          date: '2026-10-08',
          amountCents: -10000,
          descriptionRaw: 'COMPRA 1',
          description: 'Compra 1',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
        },
        {
          accountId: card!.id,
          date: '2026-10-12',
          amountCents: -20000,
          descriptionRaw: 'COMPRA 2',
          description: 'Compra 2',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
        },
      ])
      .returning();

    // Primeiro disparo de updateAccount mudando closingDay para 15 (força cálculo inicial se mudarmos para 10)
    await updateAccount(db, {
      accountId: card!.id,
      patch: { closingDay: 10, dueDay: 17 },
    });

    // Com fechamento dia 10 e vencimento dia 17:
    // - tx1 (08/10) entra na fatura de 2026-10-01 (total 10000)
    // - tx2 (12/10) entra na fatura de 2026-11-01 (total 20000)
    const [afterTx1] = await db.select().from(transactions).where(eq(transactions.id, tx1!.id));
    const [afterTx2] = await db.select().from(transactions).where(eq(transactions.id, tx2!.id));
    expect(afterTx1!.invoiceId).not.toBeNull();
    expect(afterTx2!.invoiceId).not.toBeNull();
    expect(afterTx1!.invoiceId).not.toBe(afterTx2!.invoiceId);

    const [invOct] = await db.select().from(invoices).where(eq(invoices.id, afterTx1!.invoiceId!));
    const [invNov] = await db.select().from(invoices).where(eq(invoices.id, afterTx2!.invoiceId!));
    expect(invOct!.referenceMonth).toBe('2026-10-01');
    expect(invOct!.totalCents).toBe(10000);
    expect(invNov!.referenceMonth).toBe('2026-11-01');
    expect(invNov!.totalCents).toBe(20000);
  });

  it('triggerSync sincroniza conexão específica ou todas as elegíveis (active, error e syncing > 30min) (A1-08)', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const now = new Date('2026-10-20T12:00:00.000Z');
    const fortyMinAgo = new Date(now.getTime() - 40 * 60 * 1000);
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const [cActive, cError, cStuck, cRecentSyncing] = await db
      .insert(connections)
      .values([
        { provider: 'pluggy', externalId: 'item-active', status: 'active', updatedAt: fortyMinAgo },
        { provider: 'pluggy', externalId: 'item-error', status: 'error', updatedAt: fortyMinAgo },
        { provider: 'pluggy', externalId: 'item-stuck', status: 'syncing', updatedAt: fortyMinAgo },
        { provider: 'pluggy', externalId: 'item-recent', status: 'syncing', updatedAt: fiveMinAgo },
      ])
      .returning();

    const fakeAdapter = createPluggyAdapter(
      createFakePluggyApi({
        items: [
          { id: 'item-active', status: 'UPDATED', connector: { id: 201, name: 'Nubank' } },
          { id: 'item-error', status: 'UPDATED', connector: { id: 202, name: 'Itaú' } },
          { id: 'item-stuck', status: 'UPDATED', connector: { id: 203, name: 'Mercado Pago' } },
        ],
      }),
    );

    const res = await triggerSync(
      db,
      { connectionId: null },
      { adapter: fakeAdapter, today: '2026-10-20', now },
    );
    expect(res.syncRunId).toBeDefined();

    const runs = await db.select().from(syncRuns);
    expect(runs).toHaveLength(3);
    const syncedConnIds = new Set(runs.map((r) => r.connectionId));
    expect(syncedConnIds.has(cActive!.id)).toBe(true);
    expect(syncedConnIds.has(cError!.id)).toBe(true);
    expect(syncedConnIds.has(cStuck!.id)).toBe(true);
    expect(syncedConnIds.has(cRecentSyncing!.id)).toBe(false);
  });
});
