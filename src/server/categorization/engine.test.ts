import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { loadFixtures } from '../../../tests/fixtures/load';
import { seedBase } from '@/server/db/seed';
import {
  accounts,
  categories,
  categorizationRules,
  institutions,
  merchants,
  providerCategoryMap,
  transactions,
  transactionSources,
} from '@/server/db/schema';
import type { NewTransaction } from '@/server/domain/types';
import { categorizeTransactions } from './engine';

async function setup() {
  const db = await createTestDb();
  await seedBase(db);
  const [inst] = await db.select().from(institutions).where(eq(institutions.slug, 'nubank'));
  const [acc] = await db.insert(accounts).values({ institutionId: inst!.id, type: 'checking', name: 'Conta' }).returning();
  const catId = async (slug: string) => (await db.select().from(categories).where(eq(categories.slug, slug)))[0]!.id;
  const insertTx = async (over: Partial<NewTransaction> = {}) =>
    (
      await db
        .insert(transactions)
        .values({
          accountId: acc!.id,
          date: '2026-10-10',
          amountCents: -2500,
          descriptionRaw: 'PADARIA SAO JOAO',
          description: 'Padaria São João',
          kind: 'expense',
          paymentMethod: 'pix',
          ...over,
        })
        .returning()
    )[0]!;
  const insertRule = async (pattern: string, setCategoryId: string, over: Partial<typeof categorizationRules.$inferInsert> = {}) =>
    (
      await db
        .insert(categorizationRules)
        .values({ matchField: 'description', matchType: 'contains', pattern, setCategoryId, ...over })
        .returning()
    )[0]!;
  const getTx = async (id: string) => (await db.select().from(transactions).where(eq(transactions.id, id)))[0]!;
  return { db, acc: acc!, catId, insertTx, insertRule, getTx };
}

describe('categorizeTransactions', () => {
  it('regra aplica categoria com origem rule e confiança 1; reprocessar não infla o contador', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    const padaria = await catId('alimentacao-padaria-cafe');
    const r = await insertRule('padaria', padaria);
    const t = await insertTx();

    const first = await categorizeTransactions(db, [t.id]);
    expect(first.byRule).toBe(1);
    const after = await getTx(t.id);
    expect(after.categoryId).toBe(padaria);
    expect(after.categorySource).toBe('rule');
    expect(after.categoryConfidence).toBe(1);
    expect(after.needsReview).toBe(false);

    await categorizeTransactions(db, [t.id]);
    const [rule] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, r.id));
    expect(rule!.hitCount).toBe(1);
  });

  it('regra aplica forma de pagamento, exceto quando o campo foi editado pelo usuário', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    await insertRule('padaria', await catId('alimentacao-padaria-cafe'), { setPaymentMethod: 'debit_card', setKind: 'expense' });
    const livre = await insertTx({ paymentMethod: 'pix' });
    const editada = await insertTx({ paymentMethod: 'pix', userEditedFields: ['paymentMethod'] });

    await categorizeTransactions(db, [livre.id, editada.id]);
    expect((await getTx(livre.id)).paymentMethod).toBe('debit_card');
    expect((await getTx(editada.id)).paymentMethod).toBe('pix');
  });

  it('memória do estabelecimento vence uma sugestão da IA', async () => {
    const { db, catId, insertTx, getTx } = await setup();
    const delivery = await catId('alimentacao-delivery');
    const [ifood] = await db.insert(merchants).values({ name: 'iFood', defaultCategoryId: delivery }).returning();
    const t = await insertTx({
      description: 'iFood',
      merchantId: ifood!.id,
      categoryId: await catId('outros'),
      categorySource: 'llm',
      categoryConfidence: 0.6,
    });

    const res = await categorizeTransactions(db, [t.id]);
    expect(res.byMerchant).toBe(1);
    const after = await getTx(t.id);
    expect(after.categoryId).toBe(delivery);
    expect(after.categorySource).toBe('merchant');
    expect(after.categoryConfidence).toBe(0.95);
  });

  it('categoria da fonte é aplicada com revisão, mas não rebaixa uma sugestão da IA', async () => {
    const { db, catId, insertTx, getTx } = await setup();
    const farmacia = await catId('saude-farmacia');
    await db.insert(providerCategoryMap).values({ provider: 'pluggy', providerCategoryId: 'cat-123', categoryId: farmacia });

    const semCategoria = await insertTx({ description: 'Drogaria X', providerCategoryId: 'cat-123' });
    const daIa = await insertTx({
      description: 'Drogaria Y',
      providerCategoryId: 'cat-123',
      categoryId: await catId('outros'),
      categorySource: 'llm',
      categoryConfidence: 0.9,
    });
    for (const t of [semCategoria, daIa]) {
      await db.insert(transactionSources).values({ transactionId: t.id, source: 'pluggy', externalId: `ext-${t.id}` });
    }

    await categorizeTransactions(db, [semCategoria.id, daIa.id]);
    const a = await getTx(semCategoria.id);
    expect(a.categoryId).toBe(farmacia);
    expect(a.categorySource).toBe('provider');
    expect(a.categoryConfidence).toBe(0.7);
    expect(a.needsReview).toBe(true);
    expect((await getTx(daIa.id)).categorySource).toBe('llm');
  });

  it('R9: categoria do usuário nunca é sobrescrita', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    const minha = await catId('lazer-saidas');
    await insertRule('padaria', await catId('alimentacao-padaria-cafe'));
    const t1 = await insertTx({ categoryId: minha, categorySource: 'user' });
    const t2 = await insertTx({ categoryId: minha, categorySource: 'llm', userEditedFields: ['category'] });

    await categorizeTransactions(db, [t1.id, t2.id]);
    expect((await getTx(t1.id)).categoryId).toBe(minha);
    expect((await getTx(t2.id)).categoryId).toBe(minha);
  });

  it('categoria de receita nunca é aplicada em despesa', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    await insertRule('padaria', await catId('salario'));
    const despesa = await insertTx();
    await categorizeTransactions(db, [despesa.id]);
    const after = await getTx(despesa.id);
    expect(after.categoryId).toBeNull();
    expect(after.needsReview).toBe(true);
  });

  it('o que nenhuma camada resolve vai para a IA; transferência é ignorada', async () => {
    const { db, insertTx, getTx } = await setup();
    const semMatch = await insertTx({ description: 'Estabelecimento novo', descriptionRaw: 'ESTAB NOVO' });
    const transferencia = await insertTx({ description: 'Pix para mim', kind: 'transfer' });
    const llm = vi.fn(async () => undefined);

    const res = await categorizeTransactions(db, [semMatch.id, transferencia.id], { llm });
    expect(res.pending).toBe(1);
    expect(llm).toHaveBeenCalledWith(db, [semMatch.id]);
    expect((await getTx(semMatch.id)).needsReview).toBe(true);
    expect((await getTx(transferencia.id)).needsReview).toBe(false);

    // Sem categorizador de IA, não lança erro
    await expect(categorizeTransactions(db, [semMatch.id])).resolves.toMatchObject({ pending: 1 });
  });

  it('integração com os dados fictícios: regra "contém uber" categoriza todas as corridas', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: '2026-10-15', months: 6, seed: 42 });
    const [saidas] = await db.select().from(categories).where(eq(categories.slug, 'lazer-saidas'));
    const [r] = await db
      .insert(categorizationRules)
      .values({ matchField: 'description', matchType: 'contains', pattern: 'uber', setCategoryId: saidas!.id })
      .returning();

    const all = await db.select({ id: transactions.id }).from(transactions);
    await categorizeTransactions(
      db,
      all.map((t) => t.id),
    );

    const uber = await db.select().from(transactions).where(eq(transactions.description, 'Uber'));
    expect(uber.length).toBeGreaterThan(0);
    for (const t of uber) {
      expect(t.categoryId).toBe(saidas!.id);
      expect(t.categorySource).toBe('rule');
    }
    const [rule] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, r!.id));
    expect(rule!.hitCount).toBe(uber.length);
  });
});
