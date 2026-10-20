import { and, eq, inArray, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { loadFixtures } from '../../../tests/fixtures/load';
import { createTestDb } from '../../../tests/helpers/db';
import { categorizeTransactions } from '../categorization/engine';
import { seedBase } from '../db/seed';
import { categories, categorizationRules, merchants, transactions } from '../db/schema';
import { setupCommandsDb } from './test-setup';
import { recategorize } from './transactions';

describe('recategorize: this e similar', () => {
  it("scope 'this': só a transação, e grava a memória do estabelecimento", async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setupCommandsDb();
    const m = await insertMerchant('Padaria Real');
    const t1 = await insertTx({ merchantId: m.id });
    const t2 = await insertTx({ merchantId: m.id });
    const padaria = cat('alimentacao-padaria-cafe');

    const res = await recategorize(db, { transactionId: t1.id, categoryId: padaria.id, scope: 'this' });
    expect(res).toEqual({ updated: 1, ruleId: null });
    expect((await getTx(t1.id)).categorySource).toBe('user');
    expect((await getTx(t2.id)).categoryId).toBeNull();
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, m.id));
    expect(merchant!.defaultCategoryId).toBe(padaria.id);
  });

  it("scope 'similar': mesmo estabelecimento, sem tocar em edição do usuário nem em natureza incompatível", async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setupCommandsDb();
    const m = await insertMerchant('Padaria Real');
    const outro = await insertMerchant('Mercado Bom');
    const restaurante = cat('alimentacao-restaurante');
    const padaria = cat('alimentacao-padaria-cafe');

    const origem = await insertTx({ merchantId: m.id });
    const livre = await insertTx({ merchantId: m.id });
    const porRegra = await insertTx({ merchantId: m.id, categoryId: restaurante.id, categorySource: 'rule' });
    const reembolso = await insertTx({ merchantId: m.id, kind: 'refund', amountCents: 2500 });
    const doUsuario = await insertTx({ merchantId: m.id, categoryId: restaurante.id, categorySource: 'user' });
    const editada = await insertTx({ merchantId: m.id, userEditedFields: ['category'] });
    const receita = await insertTx({ merchantId: m.id, kind: 'income', amountCents: 2500 });
    const transferencia = await insertTx({ merchantId: m.id, kind: 'transfer' });
    const outroMerchant = await insertTx({ merchantId: outro.id });

    const res = await recategorize(db, { transactionId: origem.id, categoryId: padaria.id, scope: 'similar' });
    expect(res).toEqual({ updated: 4, ruleId: null });

    for (const id of [livre.id, porRegra.id, reembolso.id]) {
      const t = await getTx(id);
      expect(t).toMatchObject({ categoryId: padaria.id, categorySource: 'merchant', needsReview: false, userEditedFields: [] });
      expect(t.categoryConfidence).toBeCloseTo(0.95);
    }
    expect((await getTx(doUsuario.id)).categoryId).toBe(restaurante.id);
    for (const id of [editada.id, receita.id, transferencia.id, outroMerchant.id]) {
      expect((await getTx(id)).categoryId).toBeNull();
    }
  });

  it("scope 'similar' sem estabelecimento: mesma descrição sem a parcela; datas no fim não agrupam", async () => {
    const { db, cat, insertTx, getTx } = await setupCommandsDb();
    const eletronicos = cat('compras-eletronicos');
    const origem = await insertTx({ description: 'Notebook Dell 3/10', installmentTotal: 10 });
    const outraParcela = await insertTx({ description: 'NOTEBOOK DELL 4/10', installmentTotal: 10 });
    const diferente = await insertTx({ description: 'Notebook Dell Gamer 1/10', installmentTotal: 10 });

    const res = await recategorize(db, { transactionId: origem.id, categoryId: eletronicos.id, scope: 'similar' });
    expect(res.updated).toBe(2);
    expect((await getTx(outraParcela.id)).categoryId).toBe(eletronicos.id);
    expect((await getTx(diferente.id)).categoryId).toBeNull();

    const pag = await insertTx({ description: 'Pagamento 15/10' });
    const outroPag = await insertTx({ description: 'Pagamento 20/11' });
    const r2 = await recategorize(db, { transactionId: pag.id, categoryId: cat('moradia-aluguel').id, scope: 'similar' });
    expect(r2.updated).toBe(1);
    expect((await getTx(outroPag.id)).categoryId).toBeNull();
  });

  it('categoria arquivada → VALIDATION', async () => {
    const { db, insertTx, newCategory } = await setupCommandsDb();
    const c = await newCategory('Velha', 'expense');
    await db.update(categories).set({ archived: true }).where(eq(categories.id, c.id));
    const t = await insertTx();
    await expect(recategorize(db, { transactionId: t.id, categoryId: c.id, scope: 'similar' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});

describe('recategorize: rule', () => {
  it('com estabelecimento: regra aprendida merchant equals, aplicada pelo motor', async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setupCommandsDb();
    const m = await insertMerchant('Padaria Real');
    const padaria = cat('alimentacao-padaria-cafe');
    const restaurante = cat('alimentacao-restaurante');
    const origem = await insertTx({ merchantId: m.id });
    const livre = await insertTx({ merchantId: m.id });
    const doUsuario = await insertTx({ merchantId: m.id, categoryId: restaurante.id, categorySource: 'user' });

    const res = await recategorize(db, { transactionId: origem.id, categoryId: padaria.id, scope: 'rule' });
    expect(res.updated).toBe(2);
    const [rule] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, res.ruleId!));
    expect(rule).toMatchObject({
      origin: 'learned',
      matchField: 'merchant',
      matchType: 'equals',
      pattern: 'Padaria Real',
      setCategoryId: padaria.id,
      hitCount: 1,
    });
    expect(await getTx(livre.id)).toMatchObject({ categoryId: padaria.id, categorySource: 'rule', categoryConfidence: 1 });
    expect((await getTx(doUsuario.id)).categoryId).toBe(restaurante.id);
  });

  it('corrigir duas vezes o mesmo estabelecimento: uma única regra, e a correção mais recente vale', async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setupCommandsDb();
    const m = await insertMerchant('Uber');
    const app = cat('transporte-app');
    const saidas = cat('lazer-saidas');
    const a = await insertTx({ description: 'Uber', merchantId: m.id });
    const b = await insertTx({ description: 'Uber', merchantId: m.id });
    const c = await insertTx({ description: 'Uber', merchantId: m.id });

    const r1 = await recategorize(db, { transactionId: a.id, categoryId: app.id, scope: 'rule' });
    expect((await getTx(c.id)).categoryId).toBe(app.id);
    const r2 = await recategorize(db, { transactionId: b.id, categoryId: saidas.id, scope: 'rule' });
    expect(r2.ruleId).toBe(r1.ruleId);
    expect(r2.updated).toBe(2); // b (do usuário) + c (pela regra atualizada)
    const rules = await db.select().from(categorizationRules);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ setCategoryId: saidas.id, enabled: true });

    // a continua com a correção do próprio usuário; uma corrida nova segue a correção mais recente
    expect((await getTx(a.id)).categoryId).toBe(app.id);
    expect((await getTx(c.id)).categoryId).toBe(saidas.id);
    const nova = await insertTx({ description: 'Uber', merchantId: m.id });
    await categorizeTransactions(db, [nova.id]);
    expect(await getTx(nova.id)).toMatchObject({ categoryId: saidas.id, categorySource: 'rule' });
  });

  it('regra do usuário com o mesmo critério e prioridade: a aprendida, mais recente, vence', async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setupCommandsDb();
    const m = await insertMerchant('Uber');
    const compras = cat('compras');
    const app = cat('transporte-app');
    await db
      .insert(categorizationRules)
      .values({ matchField: 'merchant', matchType: 'equals', pattern: 'Uber', setCategoryId: compras.id });
    const a = await insertTx({ description: 'Uber', merchantId: m.id });
    const b = await insertTx({ description: 'Uber', merchantId: m.id });
    await categorizeTransactions(db, [a.id, b.id]);
    expect((await getTx(b.id)).categoryId).toBe(compras.id);

    await recategorize(db, { transactionId: a.id, categoryId: app.id, scope: 'rule' });
    expect(await db.select().from(categorizationRules)).toHaveLength(2);
    expect(await getTx(b.id)).toMatchObject({ categoryId: app.id, categorySource: 'rule' });

    const nova = await insertTx({ description: 'Uber', merchantId: m.id });
    await categorizeTransactions(db, [b.id, nova.id]);
    expect((await getTx(b.id)).categoryId).toBe(app.id);
    expect((await getTx(nova.id)).categoryId).toBe(app.id);
  });

  it('respeita regra de prioridade maior e reprocessar não alterna (Uber Eats)', async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setupCommandsDb();
    const m = await insertMerchant('Uber');
    const delivery = cat('alimentacao-delivery');
    const app = cat('transporte-app');
    await db.insert(categorizationRules).values({
      priority: 10,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'uber eats',
      setCategoryId: delivery.id,
    });
    const eats = await insertTx({ description: 'Uber Eats', merchantId: m.id });
    const corrida = await insertTx({ description: 'Uber', merchantId: m.id });
    const outraCorrida = await insertTx({ description: 'Uber', merchantId: m.id });
    await categorizeTransactions(db, [eats.id]);
    expect((await getTx(eats.id)).categoryId).toBe(delivery.id);

    const res = await recategorize(db, { transactionId: corrida.id, categoryId: app.id, scope: 'rule' });
    expect(res.updated).toBe(2);
    expect((await getTx(eats.id)).categoryId).toBe(delivery.id);
    expect((await getTx(outraCorrida.id)).categoryId).toBe(app.id);

    await categorizeTransactions(db, [eats.id, corrida.id, outraCorrida.id]);
    expect((await getTx(eats.id)).categoryId).toBe(delivery.id);
    expect((await getTx(corrida.id)).categoryId).toBe(app.id);
    expect((await getTx(outraCorrida.id)).categoryId).toBe(app.id);
  });

  it('sem estabelecimento: parcela vira starts_with da descrição-base', async () => {
    const { db, cat, insertTx, getTx } = await setupCommandsDb();
    const eletronicos = cat('compras-eletronicos');
    const origem = await insertTx({ description: 'Notebook Dell 3/10', installmentTotal: 10 });
    const outra = await insertTx({ description: 'Notebook Dell 4/10', installmentTotal: 10 });

    const res = await recategorize(db, { transactionId: origem.id, categoryId: eletronicos.id, scope: 'rule' });
    const [rule] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, res.ruleId!));
    expect(rule).toMatchObject({ origin: 'learned', matchField: 'description', matchType: 'starts_with', pattern: 'Notebook Dell' });
    expect(res.updated).toBe(2);
    expect((await getTx(outra.id)).categorySource).toBe('rule');
  });

  it.each(['Pagamento 15/10', 'Pix enviado 10/10', 'LOJA X12/10'])(
    'sem estabelecimento, "%s" gera regra equals que não pega outras transações',
    async (description) => {
      const { db, cat, insertTx, getTx } = await setupCommandsDb();
      const origem = await insertTx({ description });
      const outras = await Promise.all(
        [
          'Pagamento de boleto - Condomínio',
          'Pagamento fatura cartão',
          'Pagamento 20/11',
          'Pix enviado 05/10',
          'Pix enviado',
          'LOJA X',
          'LOJA X13/10',
        ].map((d) => insertTx({ description: d })),
      );

      const res = await recategorize(db, { transactionId: origem.id, categoryId: cat('moradia-aluguel').id, scope: 'rule' });
      expect(res.updated).toBe(1);
      const [rule] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, res.ruleId!));
      expect(rule).toMatchObject({ matchField: 'description', matchType: 'equals', pattern: description });
      for (const t of outras) expect((await getTx(t.id)).categoryId).toBeNull();
    },
  );

  it('erro no meio desfaz tudo (db.transaction)', async () => {
    const { db, cat, insertTx, getTx } = await setupCommandsDb();
    const origem = await insertTx();
    await expect(
      recategorize(db, { transactionId: origem.id, categoryId: cat('salario').id, scope: 'rule' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await getTx(origem.id)).categoryId).toBeNull();
    expect(await db.select().from(categorizationRules)).toHaveLength(0);
  });
});

describe('recategorize: dados fictícios', () => {
  it('"aplicar a todas de Uber"', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: '2026-10-15', months: 6, seed: 42 });
    const [saidas] = await db.select().from(categories).where(eq(categories.slug, 'lazer-saidas'));
    const [app] = await db.select().from(categories).where(eq(categories.slug, 'transporte-app'));
    const [uber] = await db.select().from(merchants).where(eq(merchants.name, 'Uber'));
    const corridas = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.merchantId, uber!.id), isNull(transactions.deletedAt)));
    expect(corridas.length).toBeGreaterThan(2);

    const [origem, editada] = corridas;
    await recategorize(db, { transactionId: editada!.id, categoryId: app!.id, scope: 'this' });

    const res = await recategorize(db, { transactionId: origem!.id, categoryId: saidas!.id, scope: 'similar' });
    expect(res.updated).toBeGreaterThan(1);

    const depois = await db.select().from(transactions).where(inArray(transactions.id, corridas.map((c) => c.id)));
    for (const t of depois) {
      if (t.id === editada!.id) expect(t).toMatchObject({ categoryId: app!.id, categorySource: 'user' });
      else expect(t.categoryId).toBe(saidas!.id);
    }
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, uber!.id));
    expect(merchant!.defaultCategoryId).toBe(saidas!.id);
  });
});
