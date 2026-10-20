import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { connections, institutions } from '../db/schema';
import { seedBase } from '../db/seed';
import { CommandError } from '../domain/errors';
import { createFakePluggyApi } from '../ingestion/pluggy/fake';
import { registerConnection } from './connections';

describe('registerConnection', () => {
  it('registra conexão ativa, vincula instituição pelo connector e grava data de consentimento', async () => {
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
  });

  it('registrar de novo o mesmo item não duplica e atualiza o status', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const fakePluggy = createFakePluggyApi({
      items: [
        {
          id: 'item-itau-456',
          status: 'UPDATING',
          connector: { id: 202, name: 'Itaú Unibanco S.A.' },
        },
      ],
    });

    const res1 = await registerConnection(
      db,
      { provider: 'pluggy', externalId: 'item-itau-456' },
      { pluggy: fakePluggy },
    );

    const [conn1] = await db.select().from(connections).where(eq(connections.id, res1.connectionId));
    expect(conn1!.status).toBe('syncing');

    // Item foi atualizado para UPDATED
    const updatedFake = createFakePluggyApi({
      items: [
        {
          id: 'item-itau-456',
          status: 'UPDATED',
          connector: { id: 202, name: 'Itaú Unibanco S.A.' },
        },
      ],
    });

    const res2 = await registerConnection(
      db,
      { provider: 'pluggy', externalId: 'item-itau-456' },
      { pluggy: updatedFake },
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
});
