import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { categories, institutions } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getSpendingSummary } from './summary';
import { getBreakdown } from './breakdown';

describe('queries / breakdown', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };
  const filterOct = { from: '2026-10-01', to: '2026-10-31' };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('soma do breakdown por categoria bate exatamente com o summary de despesas', async () => {
    const summary = await getSpendingSummary(db, filterOct);
    const byCategory = await getBreakdown(db, filterOct, 'category');

    const total = byCategory.reduce((acc, row) => acc + row.totalCents, 0);
    expect(total).toBe(summary.expenseCents);

    // Deve conter item sem categoria (itens de revisão)
    const uncategorized = byCategory.find((r) => r.key === 'uncategorized');
    expect(uncategorized).toBeDefined();
    expect(uncategorized?.label).toBe('Sem categoria');
  });

  it('soma do breakdown por parentCategory, paymentMethod, institution e account bate com summary', async () => {
    const summary = await getSpendingSummary(db, filterOct);

    for (const dim of ['parentCategory', 'paymentMethod', 'institution', 'account'] as const) {
      const breakdown = await getBreakdown(db, filterOct, dim);
      const total = breakdown.reduce((acc, row) => acc + row.totalCents, 0);
      expect(total).toBe(summary.expenseCents);
      expect(breakdown.length).toBeGreaterThan(0);
      for (const row of breakdown) {
        expect(row.totalCents).toBeGreaterThan(0);
        expect(row.count).toBeGreaterThan(0);
      }
    }
  });

  it('filtro de instituição restringe os gastos àquela instituição', async () => {
    const [nubank] = await db.select().from(institutions).where(eq(institutions.slug, 'nubank'));
    expect(nubank).toBeDefined();

    const breakdown = await getBreakdown(
      db,
      { ...filterOct, institutionIds: [nubank!.id] },
      'institution'
    );
    expect(breakdown.length).toBe(1);
    expect(breakdown[0]!.key).toBe(nubank!.id);
    expect(breakdown[0]!.label).toBe(nubank!.name);
  });

  it('filtro de forma de pagamento: credit_card_installment traz apenas parcelas', async () => {
    const breakdown = await getBreakdown(
      db,
      { ...filterOct, paymentMethods: ['credit_card_installment'] },
      'paymentMethod'
    );
    expect(breakdown.length).toBe(1);
    expect(breakdown[0]!.key).toBe('credit_card_installment');
    expect(breakdown[0]!.label).toBe('Crédito parcelado');
  });

  it('R8: filtrar pela categoria pai inclui transações das filhas', async () => {
    const [alimentacao] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));
    expect(alimentacao).toBeDefined();

    const filtered = await getBreakdown(
      db,
      { ...filterOct, categoryIds: [alimentacao!.id] },
      'category'
    );
    // Deve incluir mercado, delivery, restaurante etc.
    expect(filtered.length).toBeGreaterThan(0);
    for (const item of filtered) {
      expect(item.key).not.toBe('uncategorized');
    }
  });
});
