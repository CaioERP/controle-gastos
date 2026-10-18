import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { listConnections, listSyncRuns } from './connections';

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
});
