import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { accounts, categories, institutions, spendingLimits, transactions } from '../db/schema';
import { seedBase } from '../db/seed';
import { roundSuggestedBudget, suggestBudgets } from './suggest';

describe('suggested budgets (A4-02)', () => {
  it('arredonda a média para cima no múltiplo de R$ 10 ou R$ 50', () => {
    // Casos da especificação
    expect(roundSuggestedBudget(34210)).toBe(35000); // R$ 342,10 → R$ 350,00
    expect(roundSuggestedBudget(121500)).toBe(125000); // R$ 1.215,00 → R$ 1.250,00

    // Outros casos
    expect(roundSuggestedBudget(49999)).toBe(50000);
    expect(roundSuggestedBudget(50000)).toBe(50000);
    expect(roundSuggestedBudget(50001)).toBe(55000);
  });

  it('calcula sugestões com base na média dos últimos 3 meses cheios, descartando sem histórico ou < R$ 50', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Conta Corrente',
        type: 'checking',
        balanceCents: 500000,
      })
      .returning();

    // Cria 4 categorias de teste
    const [catRegular] = await db
      .insert(categories)
      .values({
        name: 'Supermercado Regular',
        slug: 'super-reg',
        kind: 'expense',
        icon: 'shopping-cart',
        color: '#00AA00',
      })
      .returning();

    const [catIrregular] = await db
      .insert(categories)
      .values({
        name: 'Gasto Ocasional',
        slug: 'gasto-ocas',
        kind: 'expense',
        icon: 'gift',
        color: '#FFAA00',
      })
      .returning();

    const [catSmall] = await db
      .insert(categories)
      .values({
        name: 'Gasto Pequeno',
        slug: 'gasto-peq',
        kind: 'expense',
        icon: 'tag',
        color: '#888888',
      })
      .returning();

    const [catWithLimit] = await db
      .insert(categories)
      .values({
        name: 'Transporte Limite',
        slug: 'transp-lim',
        kind: 'expense',
        icon: 'car',
        color: '#0000FF',
      })
      .returning();

    // Cria limite existente para catWithLimit: R$ 600,00 (60000 centavos)
    await db.insert(spendingLimits).values({
      name: 'Transporte',
      categoryId: catWithLimit!.id,
      amountCents: 60000,
      period: 'monthly',
      isActive: true,
    });

    // Data de referência: 2026-10-15
    // Os 3 meses cheios anteriores são: Julho (2026-07), Agosto (2026-08), Setembro (2026-09)

    // Cat 1 (Regular): R$ 300 em jul, R$ 400 em ago, R$ 350 em set -> média: R$ 350,00 -> sugerido: R$ 350,00
    await db.insert(transactions).values([
      {
        accountId: acc!.id,
        date: '2026-07-10',
        amountCents: -30000,
        currency: 'BRL',
        descriptionRaw: 'Mercado Julho',
        description: 'Mercado Julho',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
        categoryId: catRegular!.id,
      },
      {
        accountId: acc!.id,
        date: '2026-08-10',
        amountCents: -40000,
        currency: 'BRL',
        descriptionRaw: 'Mercado Agosto',
        description: 'Mercado Agosto',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
        categoryId: catRegular!.id,
      },
      {
        accountId: acc!.id,
        date: '2026-09-10',
        amountCents: -35000,
        currency: 'BRL',
        descriptionRaw: 'Mercado Setembro',
        description: 'Mercado Setembro',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
        categoryId: catRegular!.id,
      },
    ]);

    // Cat 2 (Irregular): gasto apenas em 1 dos 3 meses (julho) -> deve ser descartada
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-07-20',
      amountCents: -20000,
      currency: 'BRL',
      descriptionRaw: 'Presente Julho',
      description: 'Presente Julho',
      kind: 'expense',
      paymentMethod: 'pix',
      status: 'posted',
      categoryId: catIrregular!.id,
    });

    // Cat 3 (Small): média menor que R$ 50,00 (ex.: R$ 20 e R$ 30 nos meses -> média R$ 25,00) -> descartada
    await db.insert(transactions).values([
      {
        accountId: acc!.id,
        date: '2026-07-15',
        amountCents: -2000,
        currency: 'BRL',
        descriptionRaw: 'Cafezinho',
        description: 'Cafezinho',
        kind: 'expense',
        paymentMethod: 'pix',
        status: 'posted',
        categoryId: catSmall!.id,
      },
      {
        accountId: acc!.id,
        date: '2026-08-15',
        amountCents: -3000,
        currency: 'BRL',
        descriptionRaw: 'Cafezinho',
        description: 'Cafezinho',
        kind: 'expense',
        paymentMethod: 'pix',
        status: 'posted',
        categoryId: catSmall!.id,
      },
    ]);

    // Cat 4 (WithLimit): gastos em 2 meses de R$ 600 e R$ 800 -> média R$ 700,00 -> sugerido R$ 700,00 (70000 centavos)
    // Limite atual é R$ 600 (60000) -> diferença deve ser +R$ 100 (10000)
    await db.insert(transactions).values([
      {
        accountId: acc!.id,
        date: '2026-08-05',
        amountCents: -60000,
        currency: 'BRL',
        descriptionRaw: 'Combustível',
        description: 'Combustível',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
        categoryId: catWithLimit!.id,
      },
      {
        accountId: acc!.id,
        date: '2026-09-05',
        amountCents: -80000,
        currency: 'BRL',
        descriptionRaw: 'Combustível',
        description: 'Combustível',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
        categoryId: catWithLimit!.id,
      },
    ]);

    const suggestions = await suggestBudgets(db, '2026-10-15');

    // Somente catWithLimit e catRegular devem ser sugeridas
    const suggestedCatIds = suggestions.map((s) => s.categoryId);
    expect(suggestedCatIds).toContain(catRegular!.id);
    expect(suggestedCatIds).toContain(catWithLimit!.id);
    expect(suggestedCatIds).not.toContain(catIrregular!.id);
    expect(suggestedCatIds).not.toContain(catSmall!.id);

    const sugRegular = suggestions.find((s) => s.categoryId === catRegular!.id)!;
    expect(sugRegular.averageCents).toBe(35000);
    expect(sugRegular.suggestedAmountCents).toBe(35000);
    expect(sugRegular.currentLimitCents).toBeNull();
    expect(sugRegular.differenceCents).toBeNull();
    expect(sugRegular.monthsCount).toBe(3);

    const sugWithLimit = suggestions.find((s) => s.categoryId === catWithLimit!.id)!;
    expect(sugWithLimit.averageCents).toBe(70000);
    expect(sugWithLimit.suggestedAmountCents).toBe(70000);
    expect(sugWithLimit.currentLimitCents).toBe(60000);
    expect(sugWithLimit.differenceCents).toBe(10000);
    expect(sugWithLimit.monthsCount).toBe(2);
  });
});
