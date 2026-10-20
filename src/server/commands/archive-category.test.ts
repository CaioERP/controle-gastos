import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { categories, categorizationRules, merchants, providerCategoryMap, transactions } from '../db/schema';
import { categorizeTransactions } from '../categorization/engine';
import { CommandError } from '../domain/errors';
import { archiveCategory } from './categories';
import { setupCommandsDb } from './test-setup';

describe('archiveCategory (A1-08)', () => {
  it('sem destino e com transações → CONFLICT; nada é arquivado', async () => {
    const { db, insertTx, newCategory } = await setupCommandsDb();
    const c = await newCategory('Hobby X', 'expense');
    await insertTx({ categoryId: c.id, categorySource: 'user' });

    const err = await archiveCategory(db, { categoryId: c.id, moveTransactionsTo: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toMatchObject({ code: 'CONFLICT', message: 'Categoria em uso: escolha para onde mover as transações' });
    const [row] = await db.select().from(categories).where(eq(categories.id, c.id));
    expect(row!.archived).toBe(false);
  });

  it('sem destino e só com transações excluídas: arquiva, desabilita regras e zera referências', async () => {
    const { db, insertTx, insertMerchant, newCategory, getTx } = await setupCommandsDb();
    const c = await newCategory('Hobby Y', 'expense');
    const t = await insertTx({ categoryId: c.id });
    await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, t.id));
    const [rule] = await db
      .insert(categorizationRules)
      .values({ matchField: 'description', matchType: 'contains', pattern: 'hobby', setCategoryId: c.id })
      .returning();
    const m = await insertMerchant('Loja Hobby', c.id);
    await db.insert(providerCategoryMap).values({ provider: 'pluggy', providerCategoryId: 'x1', categoryId: c.id });

    await archiveCategory(db, { categoryId: c.id, moveTransactionsTo: null });
    const [row] = await db.select().from(categories).where(eq(categories.id, c.id));
    expect(row!.archived).toBe(true);
    expect((await getTx(t.id)).categoryId).toBe(c.id);
    const [r] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, rule!.id));
    expect(r!.enabled).toBe(false);
    const [mm] = await db.select().from(merchants).where(eq(merchants.id, m.id));
    expect(mm!.defaultCategoryId).toBeNull();
    const [pm] = await db.select().from(providerCategoryMap);
    expect(pm!.categoryId).toBeNull();
  });

  it('com destino: move as transações e redireciona regras, memória e mapa da fonte', async () => {
    const { db, cat, insertTx, insertMerchant, newCategory, getTx } = await setupCommandsDb();
    const c = await newCategory('Hobby Z', 'expense');
    const outros = cat('outros');
    const doUsuario = await insertTx({ categoryId: c.id, categorySource: 'user', needsReview: false });
    const porRegra = await insertTx({ categoryId: c.id, categorySource: 'rule', needsReview: false });
    const porIa = await insertTx({ categoryId: c.id, categorySource: 'llm', needsReview: false });
    const [rule] = await db
      .insert(categorizationRules)
      .values({ matchField: 'description', matchType: 'contains', pattern: 'hobby', setCategoryId: c.id })
      .returning();
    const m = await insertMerchant('Loja Hobby', c.id);
    await db.insert(providerCategoryMap).values({ provider: 'pluggy', providerCategoryId: 'x1', categoryId: c.id });

    await archiveCategory(db, { categoryId: c.id, moveTransactionsTo: outros.id });

    expect(await getTx(doUsuario.id)).toMatchObject({ categoryId: outros.id, categorySource: 'user', needsReview: false });
    expect(await getTx(porRegra.id)).toMatchObject({ categoryId: outros.id, categorySource: 'rule', needsReview: false });
    expect(await getTx(porIa.id)).toMatchObject({ categoryId: outros.id, categorySource: 'llm', needsReview: true });
    const [r] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, rule!.id));
    expect(r).toMatchObject({ setCategoryId: outros.id, enabled: true });
    const [mm] = await db.select().from(merchants).where(eq(merchants.id, m.id));
    expect(mm!.defaultCategoryId).toBe(outros.id);
    const [pm] = await db.select().from(providerCategoryMap);
    expect(pm!.categoryId).toBe(outros.id);
    const [row] = await db.select().from(categories).where(eq(categories.id, c.id));
    expect(row!.archived).toBe(true);
  });

  it('redirecionar regras não renova o updatedAt: a decisão mais nova do usuário continua vencendo o empate', async () => {
    const { db, cat, insertTx, newCategory, getTx } = await setupCommandsDb();
    const corridas = await newCategory('Corridas', 'expense');
    const delivery = cat('alimentacao-delivery');
    const app = cat('transporte-app');
    const [antiga] = await db
      .insert(categorizationRules)
      .values({
        matchField: 'description',
        matchType: 'contains',
        pattern: 'uber',
        setCategoryId: corridas.id,
        updatedAt: new Date('2026-10-01T10:00:00Z'),
      })
      .returning();
    await db.insert(categorizationRules).values({
      matchField: 'description',
      matchType: 'contains',
      pattern: 'eats',
      setCategoryId: delivery.id,
      updatedAt: new Date('2026-10-02T10:00:00Z'),
    });

    await archiveCategory(db, { categoryId: corridas.id, moveTransactionsTo: app.id });
    const [redirecionada] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, antiga!.id));
    expect(redirecionada!.setCategoryId).toBe(app.id);
    expect(redirecionada!.updatedAt.toISOString()).toBe('2026-10-01T10:00:00.000Z');

    const eats = await insertTx({ description: 'Uber Eats' });
    await categorizeTransactions(db, [eats.id]);
    expect((await getTx(eats.id)).categoryId).toBe(delivery.id);
  });

  it('desabilitar regras ao arquivar sem destino também preserva o updatedAt', async () => {
    const { db, newCategory } = await setupCommandsDb();
    const c = await newCategory('Hobby V', 'expense');
    const [rule] = await db
      .insert(categorizationRules)
      .values({
        matchField: 'description',
        matchType: 'contains',
        pattern: 'hobby',
        setCategoryId: c.id,
        updatedAt: new Date('2026-10-01T10:00:00Z'),
      })
      .returning();
    await archiveCategory(db, { categoryId: c.id, moveTransactionsTo: null });
    const [r] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, rule!.id));
    expect(r!.enabled).toBe(false);
    expect(r!.updatedAt.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });

  it('destino de outra natureza → VALIDATION', async () => {
    const { db, cat, insertTx, newCategory } = await setupCommandsDb();
    const c = await newCategory('Hobby W', 'expense');
    await insertTx({ categoryId: c.id });
    await expect(archiveCategory(db, { categoryId: c.id, moveTransactionsTo: cat('salario').id })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('arquivar o pai arquiva as filhas e move as transações e referências delas', async () => {
    const { db, cat, insertTx, insertMerchant, newCategory, getTx } = await setupCommandsDb();
    const pai = await newCategory('Esportes', 'expense');
    const filha = await newCategory('Esportes Bike', 'expense', pai.id);
    const t = await insertTx({ categoryId: filha.id, categorySource: 'rule' });
    const m = await insertMerchant('Bike Shop', filha.id);

    await expect(archiveCategory(db, { categoryId: pai.id, moveTransactionsTo: null })).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const outros = cat('outros');
    await archiveCategory(db, { categoryId: pai.id, moveTransactionsTo: outros.id });
    const rows = await db.select().from(categories).where(inArray(categories.id, [pai.id, filha.id]));
    expect(rows.every((r) => r.archived)).toBe(true);
    expect((await getTx(t.id)).categoryId).toBe(outros.id);
    const [mm] = await db.select().from(merchants).where(eq(merchants.id, m.id));
    expect(mm!.defaultCategoryId).toBe(outros.id);
  });

  it('destino não pode ser uma filha da categoria arquivada', async () => {
    const { db, newCategory } = await setupCommandsDb();
    const pai = await newCategory('Musica', 'expense');
    const filha = await newCategory('Musica Aulas', 'expense', pai.id);
    await expect(archiveCategory(db, { categoryId: pai.id, moveTransactionsTo: filha.id })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});
