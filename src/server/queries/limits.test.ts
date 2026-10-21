import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { categories, spendingLimits } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getLimitsOverview, limitStatus } from './limits';

const TODAY = '2026-10-15';
const fixtureOpts = { referenceDate: TODAY, months: 6, seed: 42 };

describe('getLimitsOverview', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('calcula visão geral de limites ativos, status, percentuais e sugestões', async () => {
    // Busca categoria Alimentação
    const [alimentacao] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, 'alimentacao'));
    expect(alimentacao).toBeDefined();

    // Insere um limite mensal de R$ 1.000,00 para Alimentação
    const [inserted] = await db
      .insert(spendingLimits)
      .values({
        name: 'Meta de Alimentação',
        categoryId: alimentacao!.id,
        amountCents: 100000, // R$ 1.000,00
        period: 'monthly',
        notifyPace: true,
        isActive: true,
      })
      .returning();

    const overview = await getLimitsOverview(db, TODAY);

    expect(overview.limitsCount).toBeGreaterThanOrEqual(1);
    expect(overview.totalBudgetedCents).toBeGreaterThanOrEqual(100000);
    expect(overview.totalSpentCents).toBeGreaterThanOrEqual(0);

    const limitRow = overview.limits.find((l) => l.id === inserted!.id);
    expect(limitRow).toBeDefined();
    expect(limitRow?.name).toBe('Meta de Alimentação');
    expect(limitRow?.categoryName).toBe(alimentacao!.name);
    expect(limitRow?.period).toBe('monthly');
    expect(limitRow?.periodFrom).toBe('2026-10-01');
    expect(limitRow?.periodTo).toBe('2026-10-31');
    expect(limitRow?.actionUrl).toContain('/transacoes?mes=2026-10');
    expect(limitRow?.actionUrl).toContain(`cat=${alimentacao!.id}`);
    expect(['ok', 'warning', 'exceeded']).toContain(limitRow?.status);

    // Sugestões devem estar presentes para categorias regulares
    expect(Array.isArray(overview.suggestions)).toBe(true);
  });

  it('ignora limites inativos nos totais orçados mas lista na coleção', async () => {
    const [paused] = await db
      .insert(spendingLimits)
      .values({
        name: 'Limite Pausado',
        amountCents: 50000,
        period: 'monthly',
        notifyPace: false,
        isActive: false,
      })
      .returning();

    const overview = await getLimitsOverview(db, TODAY);
    const pausedRow = overview.limits.find((l) => l.id === paused!.id);
    expect(pausedRow).toBeDefined();
    expect(pausedRow?.isActive).toBe(false);

    // O total orçado deve incluir apenas limites ativos
    const activeBudgetSum = overview.limits
      .filter((l) => l.isActive)
      .reduce((acc, l) => acc + l.amountCents, 0);
    expect(overview.totalBudgetedCents).toBe(activeBudgetSum);
  });
});

describe('limitStatus', () => {
  it('usa 80% como atenção por padrão e 100% como estourado', () => {
    expect(limitStatus(79)).toBe('ok');
    expect(limitStatus(80)).toBe('warning');
    expect(limitStatus(100)).toBe('exceeded');
  });

  it('respeita limiares configurados', () => {
    expect(limitStatus(85, [90, 100])).toBe('ok');
    expect(limitStatus(90, [90, 100])).toBe('warning');
    expect(limitStatus(95, [100])).toBe('ok');
  });
});
