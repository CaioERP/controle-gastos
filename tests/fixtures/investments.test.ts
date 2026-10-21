import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../helpers/db';
import { benchmarkSeries } from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import { compoundBenchmarkRates } from '@/server/investments/returns';
import { loadInvestmentFixtures } from './investments';

describe('loadInvestmentFixtures', () => {
  it('grava CDI na unidade do contrato (taxa % x 1_000_000), com acumulado plausível em 6 meses', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await loadInvestmentFixtures(db, { referenceDate: '2026-10-20' });

    const cdi = await db
      .select({ date: benchmarkSeries.date, valueMicros: benchmarkSeries.valueMicros })
      .from(benchmarkSeries)
      .where(eq(benchmarkSeries.benchmark, 'cdi'));

    const { returnBps } = compoundBenchmarkRates('cdi', cdi);
    // ~0,041% ao dia útil por 6 meses: entre 4% e 7%
    expect(returnBps).toBeGreaterThan(400);
    expect(returnBps).toBeLessThan(700);
  });
});
