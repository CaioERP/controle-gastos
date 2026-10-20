import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getNetWorthOverview } from './net-worth';

const TODAY = '2026-10-15';

describe('queries / net-worth (B3-02)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: TODAY, months: 6, seed: 42 });
  });

  it('retorna current.netWorthCents === assets - liabilities e série mensal ordenada de 12 meses', async () => {
    const overview = await getNetWorthOverview(db, { today: TODAY });

    // 1. Equação fundamental do patrimônio líquido
    expect(overview.current.assetsCents).toBe(
      overview.current.cashAccountsCents + overview.current.investmentsCents,
    );
    expect(overview.current.liabilitiesCents).toBe(
      overview.current.openInvoicesCents + overview.current.futureInstallmentsCents,
    );
    expect(overview.current.netWorthCents).toBe(
      overview.current.assetsCents - overview.current.liabilitiesCents,
    );

    // 2. Série mensal de 12 meses ordenada cronologicamente
    expect(overview.monthlySeries.length).toBe(12);
    for (let i = 0; i < overview.monthlySeries.length - 1; i++) {
      const a = overview.monthlySeries[i]!;
      const b = overview.monthlySeries[i + 1]!;
      expect(a.month.localeCompare(b.month)).toBeLessThan(0);
    }

    // Cada ponto da série obedece à equação
    for (const point of overview.monthlySeries) {
      expect(point.netWorthCents).toBe(
        point.cashAccountsCents + point.investmentsCents - point.liabilitiesCents,
      );
    }

    // 3. Decomposição por instituição
    expect(overview.byInstitution.length).toBeGreaterThan(0);
    for (const inst of overview.byInstitution) {
      expect(inst.netCents).toBe(inst.cashCents + inst.investmentsCents - inst.liabilitiesCents);
      expect(inst.name).toBeDefined();
      expect(inst.color).toBeDefined();
    }
  });
});
