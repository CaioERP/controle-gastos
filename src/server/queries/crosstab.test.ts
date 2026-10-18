import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getSpendingSummary } from './summary';
import { getCrossTab } from './crosstab';

describe('queries / crosstab', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };
  const filterOct = { from: '2026-10-01', to: '2026-10-31' };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('tabela cruzada soma exatamente o total de despesas nas linhas, colunas e células', async () => {
    const summary = await getSpendingSummary(db, filterOct);
    const ct = await getCrossTab(db, filterOct, 'parentCategory', 'paymentMethod');

    expect(ct.rows.length).toBeGreaterThan(0);
    expect(ct.cols.length).toBeGreaterThan(0);

    // Soma das linhas = summary
    const rowsTotal = ct.rows.reduce((acc, r) => acc + r.totalCents, 0);
    expect(rowsTotal).toBe(summary.expenseCents);

    // Soma das colunas = summary
    const colsTotal = ct.cols.reduce((acc, c) => acc + c.totalCents, 0);
    expect(colsTotal).toBe(summary.expenseCents);

    // Soma das células = summary
    let cellsTotal = 0;
    for (const rowKey of Object.keys(ct.cells)) {
      for (const colKey of Object.keys(ct.cells[rowKey]!)) {
        cellsTotal += ct.cells[rowKey]![colKey]!;
      }
    }
    expect(cellsTotal).toBe(summary.expenseCents);

    // Linhas e colunas ordenadas de forma decrescente
    for (let i = 1; i < ct.rows.length; i++) {
      expect(ct.rows[i - 1]!.totalCents).toBeGreaterThanOrEqual(ct.rows[i]!.totalCents);
    }
    for (let j = 1; j < ct.cols.length; j++) {
      expect(ct.cols[j - 1]!.totalCents).toBeGreaterThanOrEqual(ct.cols[j]!.totalCents);
    }
  });
});
