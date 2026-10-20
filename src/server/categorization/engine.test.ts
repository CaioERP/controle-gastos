import { describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
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
import { markReviewed } from '@/server/commands/transactions';
import { categorizeTransactions, notUserCategorized } from './engine';

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

  it('R9: a guarda do UPDATE não deixa a escrita automática alcançar categoria do usuário', async () => {
    const { db, catId, insertTx } = await setup();
    const minha = await catId('lazer-saidas');
    const livre = await insertTx();
    const doUsuario = await insertTx({ categoryId: minha, categorySource: 'user' });
    const editada = await insertTx({ categoryId: minha, categorySource: 'llm', userEditedFields: ['category'] });

    const written = await db
      .update(transactions)
      .set({ categoryId: await catId('outros'), categorySource: 'rule' })
      .where(and(inArray(transactions.id, [livre.id, doUsuario.id, editada.id]), notUserCategorized()))
      .returning({ id: transactions.id });
    expect(written.map((w) => w.id)).toEqual([livre.id]);
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

  it('aceitar a sugestão da fonte e reprocessar mantém a revisão concluída', async () => {
    const { db, catId, insertTx, getTx } = await setup();
    const farmacia = await catId('saude-farmacia');
    await db.insert(providerCategoryMap).values({ provider: 'pluggy', providerCategoryId: 'c1', categoryId: farmacia });
    const t = await insertTx({ description: 'Drogaria X', providerCategoryId: 'c1' });
    await db.insert(transactionSources).values({ transactionId: t.id, source: 'pluggy', externalId: 'ext-c1' });

    await categorizeTransactions(db, [t.id]);
    expect((await getTx(t.id)).needsReview).toBe(true);

    await markReviewed(db, { transactionIds: [t.id] });
    const reviewed = await getTx(t.id);
    expect(reviewed.needsReview).toBe(false);

    const res = await categorizeTransactions(db, [t.id]);
    expect(res.byProvider).toBe(1);
    const after = await getTx(t.id);
    expect(after.needsReview).toBe(false);
    expect(after.categoryId).toBe(farmacia);
    expect(after.categorySource).toBe('provider');
    // Nada mudou → a linha não foi regravada
    expect(after.updatedAt.getTime()).toBe(reviewed.updatedAt.getTime());
  });

  it('setKind da regra: a categoria é conferida com a natureza que a transação terá depois da regra', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    const compras = await catId('compras');
    await insertRule('estorno', compras, { setKind: 'refund' });
    const t = await insertTx({ amountCents: 5000, kind: 'income', description: 'Estorno Loja X', descriptionRaw: 'ESTORNO LOJA X' });

    const res = await categorizeTransactions(db, [t.id]);
    expect(res).toMatchObject({ byRule: 1, pending: 0 });
    const after = await getTx(t.id);
    expect(after.kind).toBe('refund');
    expect(after.categoryId).toBe(compras);
    expect(after.categorySource).toBe('rule');
  });

  it('setKind da regra: se o usuário editou a natureza, a checagem usa a natureza atual', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    await insertRule('estorno', await catId('compras'), { setKind: 'refund' });
    const t = await insertTx({
      amountCents: 5000,
      kind: 'income',
      description: 'Estorno Loja X',
      userEditedFields: ['kind'],
    });

    const res = await categorizeTransactions(db, [t.id]);
    expect(res).toMatchObject({ byRule: 0, pending: 1 });
    const after = await getTx(t.id);
    expect(after.kind).toBe('income');
    expect(after.categoryId).toBeNull();
  });

  it('setKind da regra não se aplica a naturezas sem categoria (transferência)', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    await insertRule('aluguel', await catId('moradia-aluguel'), { setKind: 'expense' });
    const t = await insertTx({ kind: 'transfer', description: 'Pix aluguel' });

    await categorizeTransactions(db, [t.id]);
    const after = await getTx(t.id);
    expect(after.kind).toBe('transfer');
    expect(after.categoryId).toBeNull();
  });

  it('regra apagada: a transação de origem rule volta para as camadas seguintes', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    const padaria = await catId('alimentacao-padaria-cafe');
    const delivery = await catId('alimentacao-delivery');
    const r = await insertRule('padaria', padaria);
    const [loja] = await db.insert(merchants).values({ name: 'Padaria São João', defaultCategoryId: delivery }).returning();
    const comMemoria = await insertTx({ merchantId: loja!.id });
    const semMemoria = await insertTx();

    await categorizeTransactions(db, [comMemoria.id, semMemoria.id]);
    expect((await getTx(comMemoria.id)).categorySource).toBe('rule');

    await db.delete(categorizationRules).where(eq(categorizationRules.id, r.id));
    const res = await categorizeTransactions(db, [comMemoria.id, semMemoria.id]);
    expect(res).toMatchObject({ byRule: 0, byMerchant: 1 });

    const a = await getTx(comMemoria.id);
    expect(a.categoryId).toBe(delivery);
    expect(a.categorySource).toBe('merchant');
    expect(a.categoryConfidence).toBe(0.95);
    // Sem outra camada, mantém a categoria que já tinha (não volta a ficar sem categoria)
    const b = await getTx(semMemoria.id);
    expect(b.categoryId).toBe(padaria);
    expect(b.categorySource).toBe('rule');
  });

  it('empate de critério: vence a regra alterada mais recentemente', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    const padaria = await catId('alimentacao-padaria-cafe');
    const restaurante = await catId('alimentacao-restaurante');
    await insertRule('padaria', padaria, { updatedAt: new Date('2026-10-02T10:00:00Z') });
    await insertRule('padaria', restaurante, { updatedAt: new Date('2026-10-01T10:00:00Z') });
    const t = await insertTx();

    await categorizeTransactions(db, [t.id]);
    expect((await getTx(t.id)).categoryId).toBe(padaria);
  });

  it('empate total entre regras (inclusive updatedAt): vence sempre a de menor id', async () => {
    const { db, catId, insertTx, insertRule, getTx } = await setup();
    const padaria = await catId('alimentacao-padaria-cafe');
    const restaurante = await catId('alimentacao-restaurante');
    const same = new Date('2026-10-01T10:00:00Z');
    const r1 = await insertRule('padaria', padaria, { updatedAt: same });
    const r2 = await insertRule('padaria', restaurante, { updatedAt: same });
    const winner = r1.id < r2.id ? r1 : r2;
    const t = await insertTx();

    await categorizeTransactions(db, [t.id]);
    expect((await getTx(t.id)).categoryId).toBe(winner.setCategoryId);
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
