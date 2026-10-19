import { and, eq, inArray, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { loadFixtures } from '../../../tests/fixtures/load';
import { createTestDb } from '../../../tests/helpers/db';
import type { Db } from '../db/client';
import { seedBase } from '../db/seed';
import { accounts, categories, categorizationRules, institutions, merchants, transactions } from '../db/schema';
import type { TxKind } from '../domain/enums';
import { CommandError } from '../domain/errors';
import { archiveCategory } from './categories';
import { upsertRule, type RuleInput } from './rules';
import { descriptionBase, recategorize } from './transactions';

async function setup() {
  const db = await createTestDb();
  await seedBase(db);
  const [inst] = await db.select().from(institutions).limit(1);
  const [acc] = await db
    .insert(accounts)
    .values({ institutionId: inst!.id, type: 'checking', name: 'Conta Teste' })
    .returning();
  const catRows = await db.select().from(categories);
  const cat = (slug: string) => catRows.find((c) => c.slug === slug)!;

  let n = 0;
  async function insertTx(o: {
    description?: string;
    merchantId?: string | null;
    kind?: TxKind;
    amountCents?: number;
    categoryId?: string | null;
    categorySource?: 'default' | 'user' | 'rule' | 'merchant' | 'provider';
    userEditedFields?: string[];
  } = {}) {
    n++;
    const [t] = await db
      .insert(transactions)
      .values({
        accountId: acc!.id,
        date: `2026-10-${String((n % 28) + 1).padStart(2, '0')}`,
        amountCents: o.amountCents ?? -2500,
        descriptionRaw: (o.description ?? 'Padaria Real').toUpperCase(),
        description: o.description ?? 'Padaria Real',
        merchantId: o.merchantId ?? null,
        kind: o.kind ?? 'expense',
        paymentMethod: 'debit_card',
        categoryId: o.categoryId ?? null,
        categorySource: o.categorySource ?? 'default',
        needsReview: true,
        userEditedFields: o.userEditedFields ?? [],
      })
      .returning();
    return t!;
  }

  async function insertMerchant(name: string) {
    const [m] = await db.insert(merchants).values({ name }).returning();
    return m!;
  }

  const getTx = async (id: string) => (await db.select().from(transactions).where(eq(transactions.id, id)))[0]!;

  return { db, acc: acc!, cat, insertTx, insertMerchant, getTx };
}

describe('descriptionBase', () => {
  it('remove o sufixo de parcela', () => {
    expect(descriptionBase('Notebook Dell 3/10')).toBe('Notebook Dell');
    expect(descriptionBase('MAGAZINE LUIZA PARC 03/10')).toBe('MAGAZINE LUIZA');
    expect(descriptionBase('Loja X - Parcela 1 de 12')).toBe('Loja X');
    expect(descriptionBase('Uber')).toBe('Uber');
  });
});

describe('recategorize (A1-08)', () => {
  it("scope 'this': só a transação, e grava a memória do estabelecimento", async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setup();
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

  it("scope 'similar': aplica no mesmo estabelecimento sem tocar em edição do usuário nem em natureza incompatível", async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setup();
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

    expect((await getTx(origem.id)).categorySource).toBe('user');
    for (const id of [livre.id, porRegra.id, reembolso.id]) {
      const t = await getTx(id);
      expect(t.categoryId).toBe(padaria.id);
      expect(t.categorySource).toBe('merchant');
      expect(t.categoryConfidence).toBeCloseTo(0.95);
      expect(t.needsReview).toBe(false);
      expect(t.userEditedFields).toEqual([]);
    }
    expect((await getTx(doUsuario.id)).categoryId).toBe(restaurante.id);
    expect((await getTx(editada.id)).categoryId).toBeNull();
    expect((await getTx(receita.id)).categoryId).toBeNull();
    expect((await getTx(transferencia.id)).categoryId).toBeNull();
    expect((await getTx(outroMerchant.id)).categoryId).toBeNull();
  });

  it("scope 'similar' sem estabelecimento: mesma descrição sem o sufixo de parcela", async () => {
    const { db, cat, insertTx, getTx } = await setup();
    const eletronicos = cat('compras-eletronicos');
    const origem = await insertTx({ description: 'Notebook Dell 3/10' });
    const outraParcela = await insertTx({ description: 'NOTEBOOK DELL 4/10' });
    const diferente = await insertTx({ description: 'Notebook Dell Gamer 1/10' });

    const res = await recategorize(db, { transactionId: origem.id, categoryId: eletronicos.id, scope: 'similar' });
    expect(res.updated).toBe(2);
    expect((await getTx(outraParcela.id)).categoryId).toBe(eletronicos.id);
    expect((await getTx(diferente.id)).categoryId).toBeNull();
  });

  it("scope 'rule' com estabelecimento: cria regra aprendida (merchant equals) e aplica nas existentes", async () => {
    const { db, cat, insertTx, insertMerchant, getTx } = await setup();
    const m = await insertMerchant('Padaria Real');
    const padaria = cat('alimentacao-padaria-cafe');
    const restaurante = cat('alimentacao-restaurante');
    const origem = await insertTx({ merchantId: m.id });
    const livre = await insertTx({ merchantId: m.id });
    const doUsuario = await insertTx({ merchantId: m.id, categoryId: restaurante.id, categorySource: 'user' });

    const res = await recategorize(db, { transactionId: origem.id, categoryId: padaria.id, scope: 'rule' });
    expect(res.updated).toBe(2);
    expect(res.ruleId).not.toBeNull();

    const [rule] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, res.ruleId!));
    expect(rule).toMatchObject({
      origin: 'learned',
      matchField: 'merchant',
      matchType: 'equals',
      pattern: 'Padaria Real',
      setCategoryId: padaria.id,
      hitCount: 1,
    });
    const t = await getTx(livre.id);
    expect(t.categoryId).toBe(padaria.id);
    expect(t.categorySource).toBe('rule');
    expect(t.categoryConfidence).toBe(1);
    expect((await getTx(doUsuario.id)).categoryId).toBe(restaurante.id);
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, m.id));
    expect(merchant!.defaultCategoryId).toBe(padaria.id);
  });

  it("scope 'rule' sem estabelecimento: regra description contains com a descrição-base", async () => {
    const { db, cat, insertTx, getTx } = await setup();
    const eletronicos = cat('compras-eletronicos');
    const origem = await insertTx({ description: 'Notebook Dell 3/10' });
    const outra = await insertTx({ description: 'Notebook Dell Gamer 1/10' });

    const res = await recategorize(db, { transactionId: origem.id, categoryId: eletronicos.id, scope: 'rule' });
    const [rule] = await db.select().from(categorizationRules).where(eq(categorizationRules.id, res.ruleId!));
    expect(rule).toMatchObject({ origin: 'learned', matchField: 'description', matchType: 'contains', pattern: 'Notebook Dell' });
    expect(res.updated).toBe(2);
    expect((await getTx(outra.id)).categorySource).toBe('rule');
  });

  it('erro no meio desfaz tudo (db.transaction)', async () => {
    const { db, cat, insertTx, getTx } = await setup();
    const origem = await insertTx();
    await expect(
      recategorize(db, { transactionId: origem.id, categoryId: cat('salario').id, scope: 'rule' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await getTx(origem.id)).categoryId).toBeNull();
    expect(await db.select().from(categorizationRules)).toHaveLength(0);
  });

  it('integração com os dados fictícios: "aplicar a todas de Uber"', async () => {
    const db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: '2026-10-15', months: 6, seed: 42 });
    const [saidas] = await db.select().from(categories).where(eq(categories.slug, 'lazer-saidas'));
    const [uber] = await db.select().from(merchants).where(eq(merchants.name, 'Uber'));
    const corridas = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.merchantId, uber!.id), isNull(transactions.deletedAt)));
    expect(corridas.length).toBeGreaterThan(2);

    const [origem, editada] = corridas;
    await recategorize(db, { transactionId: editada!.id, categoryId: saidas!.id, scope: 'this' });
    const [transporteApp] = await db.select().from(categories).where(eq(categories.slug, 'transporte-app'));
    await recategorize(db, { transactionId: editada!.id, categoryId: transporteApp!.id, scope: 'this' });

    const res = await recategorize(db, { transactionId: origem!.id, categoryId: saidas!.id, scope: 'similar' });
    expect(res.updated).toBeGreaterThan(1);

    const depois = await db
      .select()
      .from(transactions)
      .where(inArray(transactions.id, corridas.map((c) => c.id)));
    for (const t of depois) {
      if (t.id === editada!.id) {
        expect(t.categoryId).toBe(transporteApp!.id);
        expect(t.categorySource).toBe('user');
      } else {
        expect(t.categoryId).toBe(saidas!.id);
        expect(['user', 'merchant']).toContain(t.categorySource);
      }
    }
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, uber!.id));
    expect(merchant!.defaultCategoryId).toBe(saidas!.id);
  });
});

describe('upsertRule (A1-08)', () => {
  const baseRule = (setCategoryId: string, o: Partial<RuleInput> = {}): RuleInput => ({
    priority: 0,
    matchField: 'description',
    matchType: 'contains',
    pattern: 'padaria',
    accountId: null,
    amountMinCents: null,
    amountMaxCents: null,
    setCategoryId,
    setKind: null,
    setPaymentMethod: null,
    enabled: true,
    ...o,
  });

  it('aplica nas transações existentes que casam e devolve applied', async () => {
    const { db, cat, insertTx, getTx } = await setup();
    const padaria = cat('alimentacao-padaria-cafe');
    const restaurante = cat('alimentacao-restaurante');
    const a = await insertTx();
    const b = await insertTx({ description: 'Padaria Real 2' });
    const doUsuario = await insertTx({ categoryId: restaurante.id, categorySource: 'user' });
    const editada = await insertTx({ userEditedFields: ['category'] });
    const naoCasa = await insertTx({ description: 'Posto Shell' });

    const res = await upsertRule(db, baseRule(padaria.id));
    expect(res.applied).toBe(2);
    for (const id of [a.id, b.id]) {
      const t = await getTx(id);
      expect(t.categoryId).toBe(padaria.id);
      expect(t.categorySource).toBe('rule');
    }
    expect((await getTx(doUsuario.id)).categoryId).toBe(restaurante.id);
    expect((await getTx(editada.id)).categoryId).toBeNull();
    expect((await getTx(naoCasa.id)).categoryId).toBeNull();

    // Salvar de novo sem mudanças não reaplica: applied = 0
    const again = await upsertRule(db, { ...baseRule(padaria.id), id: res.id });
    expect(again.applied).toBe(0);
  });

  it('editar a regra reaplica com a nova categoria', async () => {
    const { db, cat, insertTx, getTx } = await setup();
    const padaria = cat('alimentacao-padaria-cafe');
    const restaurante = cat('alimentacao-restaurante');
    const a = await insertTx();
    const res = await upsertRule(db, baseRule(padaria.id));
    const edited = await upsertRule(db, { ...baseRule(restaurante.id), id: res.id });
    expect(edited.applied).toBe(1);
    expect((await getTx(a.id)).categoryId).toBe(restaurante.id);
  });

  it('regra desabilitada não aplica nada', async () => {
    const { db, cat, insertTx, getTx } = await setup();
    const a = await insertTx();
    const res = await upsertRule(db, baseRule(cat('alimentacao-padaria-cafe').id, { enabled: false }));
    expect(res.applied).toBe(0);
    expect((await getTx(a.id)).categoryId).toBeNull();
  });
});

describe('archiveCategory (A1-08)', () => {
  async function newCategory(db: Db, name: string, kind: 'expense' | 'income', parentId: string | null = null) {
    const [c] = await db
      .insert(categories)
      .values({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), kind, icon: 'tag', color: '#123456', parentId })
      .returning();
    return c!;
  }

  it('sem destino e com transações → CONFLICT; nada é arquivado', async () => {
    const { db, insertTx } = await setup();
    const c = await newCategory(db, 'Hobby X', 'expense');
    await insertTx({ categoryId: c.id, categorySource: 'user' });

    const err = await archiveCategory(db, { categoryId: c.id, moveTransactionsTo: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommandError);
    expect(err).toMatchObject({ code: 'CONFLICT', message: 'Categoria em uso: escolha para onde mover as transações' });
    const [row] = await db.select().from(categories).where(eq(categories.id, c.id));
    expect(row!.archived).toBe(false);
  });

  it('sem destino e só com transações excluídas: arquiva', async () => {
    const { db, insertTx } = await setup();
    const c = await newCategory(db, 'Hobby Y', 'expense');
    const t = await insertTx({ categoryId: c.id });
    await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, t.id));
    await archiveCategory(db, { categoryId: c.id, moveTransactionsTo: null });
    const [row] = await db.select().from(categories).where(eq(categories.id, c.id));
    expect(row!.archived).toBe(true);
  });

  it('com destino: move as transações e arquiva', async () => {
    const { db, cat, insertTx, getTx } = await setup();
    const c = await newCategory(db, 'Hobby Z', 'expense');
    const t = await insertTx({ categoryId: c.id, categorySource: 'user' });
    const outros = cat('outros');

    await archiveCategory(db, { categoryId: c.id, moveTransactionsTo: outros.id });
    expect((await getTx(t.id)).categoryId).toBe(outros.id);
    const [row] = await db.select().from(categories).where(eq(categories.id, c.id));
    expect(row!.archived).toBe(true);
  });

  it('destino de outra natureza → VALIDATION', async () => {
    const { db, cat, insertTx } = await setup();
    const c = await newCategory(db, 'Hobby W', 'expense');
    await insertTx({ categoryId: c.id });
    await expect(
      archiveCategory(db, { categoryId: c.id, moveTransactionsTo: cat('salario').id }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('arquivar o pai arquiva as filhas e move as transações delas', async () => {
    const { db, cat, insertTx, getTx } = await setup();
    const pai = await newCategory(db, 'Esportes', 'expense');
    const filha = await newCategory(db, 'Esportes Bike', 'expense', pai.id);
    const t = await insertTx({ categoryId: filha.id, categorySource: 'rule' });

    await expect(archiveCategory(db, { categoryId: pai.id, moveTransactionsTo: null })).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const outros = cat('outros');
    await archiveCategory(db, { categoryId: pai.id, moveTransactionsTo: outros.id });
    const rows = await db.select().from(categories).where(inArray(categories.id, [pai.id, filha.id]));
    expect(rows.every((r) => r.archived)).toBe(true);
    expect((await getTx(t.id)).categoryId).toBe(outros.id);
  });

  it('destino não pode ser uma filha da categoria arquivada', async () => {
    const { db } = await setup();
    const pai = await newCategory(db, 'Musica', 'expense');
    const filha = await newCategory(db, 'Musica Aulas', 'expense', pai.id);
    await expect(
      archiveCategory(db, { categoryId: pai.id, moveTransactionsTo: filha.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
