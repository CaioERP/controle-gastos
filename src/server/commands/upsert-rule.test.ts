import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { categories, categorizationRules } from '../db/schema';
import { upsertRule, type RuleInput } from './rules';
import { setupCommandsDb } from './test-setup';

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

describe('upsertRule (A1-08)', () => {
  it('aplica nas transações existentes que casam e devolve applied', async () => {
    const { db, cat, insertTx, getTx } = await setupCommandsDb();
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
      expect(await getTx(id)).toMatchObject({ categoryId: padaria.id, categorySource: 'rule' });
    }
    expect((await getTx(doUsuario.id)).categoryId).toBe(restaurante.id);
    expect((await getTx(editada.id)).categoryId).toBeNull();
    expect((await getTx(naoCasa.id)).categoryId).toBeNull();

    // Salvar de novo sem mudanças não reaplica: applied = 0
    const again = await upsertRule(db, { ...baseRule(padaria.id), id: res.id });
    expect(again.applied).toBe(0);
  });

  it('editar a regra reaplica com a nova categoria', async () => {
    const { db, cat, insertTx, getTx } = await setupCommandsDb();
    const padaria = cat('alimentacao-padaria-cafe');
    const restaurante = cat('alimentacao-restaurante');
    const a = await insertTx();
    const res = await upsertRule(db, baseRule(padaria.id));
    const edited = await upsertRule(db, { ...baseRule(restaurante.id), id: res.id });
    expect(edited.applied).toBe(1);
    expect((await getTx(a.id)).categoryId).toBe(restaurante.id);
  });

  it('regra desabilitada não aplica nada', async () => {
    const { db, cat, insertTx, getTx } = await setupCommandsDb();
    const a = await insertTx();
    const res = await upsertRule(db, baseRule(cat('alimentacao-padaria-cafe').id, { enabled: false }));
    expect(res.applied).toBe(0);
    expect((await getTx(a.id)).categoryId).toBeNull();
  });

  it('regra que perde para outra de prioridade maior: applied 0', async () => {
    const { db, cat, insertTx, getTx } = await setupCommandsDb();
    const restaurante = cat('alimentacao-restaurante');
    await db
      .insert(categorizationRules)
      .values({ priority: 10, matchField: 'description', matchType: 'contains', pattern: 'real', setCategoryId: restaurante.id });
    const a = await insertTx();
    const res = await upsertRule(db, baseRule(cat('alimentacao-padaria-cafe').id));
    expect(res.applied).toBe(0);
    expect((await getTx(a.id)).categoryId).toBe(restaurante.id);
  });

  it('categoria de outra natureza: a regra é salva e applied conta só o que mudou', async () => {
    const { db, cat, insertTx, getTx } = await setupCommandsDb();
    const salario = cat('salario');
    const despesa = await insertTx({ description: 'Empresa X' });
    const receita = await insertTx({ description: 'Empresa X salário', kind: 'income', amountCents: 500000 });

    const res = await upsertRule(db, baseRule(salario.id, { pattern: 'empresa x' }));
    expect(res.applied).toBe(1);
    expect((await getTx(despesa.id)).categoryId).toBeNull();
    expect((await getTx(receita.id)).categoryId).toBe(salario.id);

    // Com setKind, a despesa passa a receita e conta como aplicada
    const r2 = await upsertRule(db, { ...baseRule(salario.id, { pattern: 'empresa x', setKind: 'income' }), id: res.id });
    expect(r2.applied).toBe(1);
    expect(await getTx(despesa.id)).toMatchObject({ kind: 'income', categoryId: salario.id });
  });

  it('categoria arquivada → VALIDATION; inexistente → NOT_FOUND', async () => {
    const { db, newCategory } = await setupCommandsDb();
    const c = await newCategory('Velha', 'expense');
    await db.update(categories).set({ archived: true }).where(eq(categories.id, c.id));
    await expect(upsertRule(db, baseRule(c.id))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(upsertRule(db, baseRule('00000000-0000-0000-0000-000000000000'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await db.select().from(categorizationRules)).toHaveLength(0);
  });
});
