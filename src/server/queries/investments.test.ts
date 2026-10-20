import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getInvestmentsOverview } from './investments';

const TODAY = '2026-10-15';

describe('queries / investments (B3-01)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: TODAY, months: 6, seed: 42 });
  });

  it('retorna posições ativas, alocação cuja soma bate com currentValueCents e filtra por assetClass', async () => {
    const overview = await getInvestmentsOverview(db, { today: TODAY });

    // 1. Posições ativas retornadas
    expect(overview.holdings.length).toBeGreaterThan(0);
    expect(overview.totals.currentValueCents).toBeGreaterThan(0);
    expect(overview.totals.investedCents).toBeGreaterThan(0);

    // 2. Fatias de alocação cuja soma de totalCents bate exatamente com totals.currentValueCents
    const allocationTotalCents = overview.allocation.reduce((sum, slice) => sum + slice.totalCents, 0);
    expect(allocationTotalCents).toBe(overview.totals.currentValueCents);

    // Soma das fatias de participação em bps (100% ou ~10000 bps)
    const allocationShareBps = overview.allocation.reduce((sum, slice) => sum + slice.shareBps, 0);
    expect(allocationShareBps).toBeGreaterThanOrEqual(9990);
    expect(allocationShareBps).toBeLessThanOrEqual(10010);

    // 3. Filtro por assetClass restringe as holdings retornadas
    const stocksOverview = await getInvestmentsOverview(db, {
      assetClass: 'stocks',
      today: TODAY,
    });
    expect(stocksOverview.holdings.length).toBeGreaterThan(0);
    expect(stocksOverview.holdings.every((h) => h.assetClass === 'stocks')).toBe(true);

    // A alocação total ainda reflete a carteira consolidada e a soma continua batendo
    const stocksAllocationTotal = stocksOverview.allocation.reduce((sum, s) => sum + s.totalCents, 0);
    expect(stocksAllocationTotal).toBe(stocksOverview.totals.currentValueCents);

    // 4. Série de desempenho de 12 meses
    expect(overview.performanceSeries.length).toBe(12);
    expect(overview.totals.income12mCents).toBeGreaterThan(0);
  });
});
