import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { listCategories, listMerchants, listRules, listTags } from './catalog';

describe('queries / catalog', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('listCategories retorna árvore hierárquica com categorias pai e filhas', async () => {
    const categories = await listCategories(db);
    expect(categories.length).toBeGreaterThan(0);

    const alimentacao = categories.find((c) => c.slug === 'alimentacao');
    expect(alimentacao).toBeDefined();
    expect(alimentacao?.children.length).toBeGreaterThan(0);
  });

  it('listMerchants lista estabelecimentos ordenados por contagem', async () => {
    const merchants = await listMerchants(db, { limit: 20 });
    expect(merchants.length).toBeGreaterThan(0);
    for (const m of merchants) {
      expect(m.name).toBeTruthy();
    }
  });

  it('listTags e listRules funcionam sem erro', async () => {
    const tags = await listTags(db);
    expect(Array.isArray(tags)).toBe(true);

    const rules = await listRules(db);
    expect(Array.isArray(rules)).toBe(true);
  });
});
