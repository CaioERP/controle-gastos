import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase, SEED_EXPENSE_CATEGORIES, SEED_INCOME_CATEGORIES, SEED_INSTITUTIONS } from './seed';
import { categories, institutions } from './schema';

describe('seedBase', () => {
  it('é idempotente e cadastra instituições e categorias esperadas', async () => {
    const db = await createTestDb();

    // Executa 2 vezes para garantir idempotência
    await seedBase(db);
    await seedBase(db);

    const instList = await db.select().from(institutions);
    expect(instList.length).toBe(SEED_INSTITUTIONS.length);

    let totalExpectedCats = 0;
    for (const group of [SEED_EXPENSE_CATEGORIES, SEED_INCOME_CATEGORIES]) {
      for (const cat of group) {
        totalExpectedCats += 1;
        totalExpectedCats += cat.children ? cat.children.length : 0;
      }
    }

    const catList = await db.select().from(categories);
    expect(catList.length).toBe(totalExpectedCats);

    const slugs = catList.map((c) => c.slug);
    const uniqueSlugs = new Set(slugs);
    expect(slugs.length).toBe(uniqueSlugs.size);
  });
});
