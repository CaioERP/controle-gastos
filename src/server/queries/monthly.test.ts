import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getMonthlySeries } from './monthly';

describe('queries / monthly', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('sem "by": retorna todos os meses do intervalo preenchidos mesmo com meses sem dados', async () => {
    const series = await getMonthlySeries(db, {
      from: '2026-05-01',
      to: '2026-10-31',
    });

    expect(series.length).toBe(6);
    expect(series.map((s) => s.month)).toEqual([
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);
    for (const point of series) {
      expect(point.values.total).toBeDefined();
      expect(typeof point.values.total).toBe('number');
    }
    expect(series.labels.total).toBeDefined();
  });

  it('com "by" e top: 2: separa as 2 maiores séries e agrupa as restantes em "outros"', async () => {
    const series = await getMonthlySeries(
      db,
      {
        from: '2026-05-01',
        to: '2026-10-31',
      },
      'parentCategory',
      { top: 2 }
    );

    expect(series.length).toBe(6);
    expect(series.labels['outros']).toBeDefined();
    expect(series.labels['outros']?.label).toBe('Outros');

    // Labels tem 2 chaves top + 'outros'
    expect(Object.keys(series.labels).length).toBe(3);

    for (const point of series) {
      expect(point.values['outros']).toBeDefined();
      expect(Object.keys(point.values).length).toBe(3);
    }
  });

  it('executa em menos de 200 ms', async () => {
    const start = performance.now();
    await getMonthlySeries(db, {
      from: '2026-05-01',
      to: '2026-10-31',
    }, 'parentCategory');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
