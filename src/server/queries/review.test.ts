import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { generateFixtures } from '../../../tests/fixtures/generate';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getReviewCount } from './transactions';
import { listReviewQueue, listReviewSuggestions } from './review';

const opts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

describe('queries / review', () => {
  let db: Db;
  const fixtures = generateFixtures(opts);

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, opts);
  });

  it('a fila paginada cobre exatamente as transações para revisão, sem repetir, da mais recente para a mais antiga', async () => {
    const expected = fixtures.transactions.filter((t) => t.needsReview).length;
    expect(expected).toBeGreaterThan(8);

    const all = [];
    let cursor: string | undefined;
    do {
      const page = await listReviewQueue(db, { cursor, limit: 7 });
      expect(page.items.length).toBeLessThanOrEqual(7);
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(all).toHaveLength(expected);
    expect(await getReviewCount(db)).toBe(expected);
    expect(new Set(all.map((t) => t.id)).size).toBe(expected);
    expect(all.every((t) => t.needsReview)).toBe(true);
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.date >= all[i]!.date).toBe(true);
  });

  it('padrão de 30 por página', async () => {
    const page = await listReviewQueue(db);
    expect(page.items.length).toBe(Math.min(30, fixtures.transactions.filter((t) => t.needsReview).length));
  });

  it('sugestões com confiança mínima batem com os dados fictícios', async () => {
    const reportable = new Set(['expense', 'income', 'refund']);
    const oracle = (min: number) =>
      fixtures.transactions.filter(
        (t) =>
          t.needsReview &&
          (t.categorySource === 'llm' || t.categorySource === 'provider') &&
          reportable.has(t.kind) &&
          t.categorySlug &&
          (t.categoryConfidence ?? 0) >= min,
      ).length;

    const s70 = await listReviewSuggestions(db, 0.7);
    expect(s70.length).toBe(oracle(0.7));
    expect(s70.length).toBeGreaterThan(0);
    expect(s70.every((s) => s.confidence >= 0.7 && s.categoryId)).toBe(true);
    expect((await listReviewSuggestions(db, 0)).length).toBe(oracle(0));
  });
});
