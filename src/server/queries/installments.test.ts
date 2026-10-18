import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getFutureInstallments } from './installments';

describe('queries / installments', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('getFutureInstallments retorna parcelas projetadas agrupadas por mês', async () => {
    const future = await getFutureInstallments(db);
    expect(future.length).toBeGreaterThan(0);

    for (const f of future) {
      expect(f.month).toMatch(/^\d{4}-\d{2}-01$/);
      expect(f.totalCents).toBeGreaterThan(0);
      expect(f.count).toBeGreaterThan(0);
    }
  });
});
