import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { categories, spendingLimits } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { dedupeParentChild, getMonthlyLimitsSummary } from './limits-summary';

describe('limits-summary', () => {
  describe('dedupeParentChild', () => {
    it('mantém categoria pai e descarta categoria filha com meta', () => {
      const limits = [
        { categoryId: 'cat-alim', name: 'Alimentação' },
        { categoryId: 'cat-rest', name: 'Restaurantes' },
        { categoryId: 'cat-transp', name: 'Transporte' },
      ];
      const parentOf = new Map<string, string | null>([
        ['cat-alim', null],
        ['cat-rest', 'cat-alim'],
        ['cat-transp', null],
      ]);

      const result = dedupeParentChild(limits, parentOf);
      expect(result.map((r) => r.name)).toEqual(['Alimentação', 'Transporte']);
    });
  });

  describe('getMonthlyLimitsSummary', () => {
    let db: Db;
    const TODAY = '2026-10-15';

    beforeAll(async () => {
      db = await createTestDb();
      await seedBase(db);
    });

    it('soma apenas metas mensais de categoria, ignorando semanais e por forma de pagamento', async () => {
      const [alimentacao] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, 'alimentacao'));
      const [transporte] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, 'transporte'));

      expect(alimentacao).toBeDefined();
      expect(transporte).toBeDefined();

      // 2 metas mensais de categoria
      await db.insert(spendingLimits).values([
        {
          name: 'Meta Alimentação Mensal',
          categoryId: alimentacao!.id,
          amountCents: 100000, // R$ 1.000,00
          period: 'monthly',
          isActive: true,
        },
        {
          name: 'Meta Transporte Mensal',
          categoryId: transporte!.id,
          amountCents: 50000, // R$ 500,00
          period: 'monthly',
          isActive: true,
        },
        // 1 meta semanal de categoria
        {
          name: 'Meta Alimentação Semanal',
          categoryId: alimentacao!.id,
          amountCents: 25000, // R$ 250,00
          period: 'weekly',
          isActive: true,
        },
        // 1 meta por forma de pagamento
        {
          name: 'Meta Pix',
          paymentMethod: 'pix',
          amountCents: 40000, // R$ 400,00
          period: 'monthly',
          isActive: true,
        },
      ]);

      const summary = await getMonthlyLimitsSummary(db, { today: TODAY });

      expect(summary.considered).toBe(2);
      expect(summary.budgetedCents).toBe(150000);
      expect(summary.spentCents).toBe(0);
      expect(summary.spentPercent).toBe(0);
      expect(summary.exceededCount).toBe(0);
      expect(summary.critical).toHaveLength(2);
    });

    it('ignora meta de categoria filha quando categoria pai também tem meta', async () => {
      const [restaurante] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, 'alimentacao-restaurante'));
      expect(restaurante).toBeDefined();

      await db.insert(spendingLimits).values({
        name: 'Meta Restaurante Mensal',
        categoryId: restaurante!.id,
        amountCents: 30000,
        period: 'monthly',
        isActive: true,
      });

      const summary = await getMonthlyLimitsSummary(db, { today: TODAY });
      // Ainda considera apenas 2: alimentacao e transporte (restaurante é descartado por ser filho de alimentacao)
      expect(summary.considered).toBe(2);
      expect(summary.budgetedCents).toBe(150000);
    });
  });
});
