import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { loadFixtures } from '../../../tests/fixtures/load';
import { seedBase } from '@/server/db/seed';
import { accounts, categories, merchants, transactions } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getRulePreview, type RulePreview, type RulePreviewInput } from './rule-preview';

const TODAY = '2026-10-15';
// 90 dias contando o próprio dia: 18/07 a 15/10
const FIRST_DAY = '2026-07-18';

function rule(patch: Partial<RulePreviewInput>): RulePreviewInput {
  return {
    matchField: 'description',
    matchType: 'contains',
    pattern: 'zqx padaria',
    accountId: null,
    amountMinCents: null,
    amountMaxCents: null,
    ...patch,
  };
}

function ok(p: RulePreview) {
  if (p.status !== 'ok') throw new Error(`status inesperado: ${p.status}`);
  return p;
}

describe('queries / rule-preview', () => {
  let db: Db;
  let accountA: string;
  let accountB: string;
  let categoryId: string;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: TODAY, months: 6, seed: 42 });

    const accs = await db.select({ id: accounts.id }).from(accounts).limit(2);
    accountA = accs[0]!.id;
    accountB = accs[1]!.id;
    const [cat] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, 'alimentacao'));
    categoryId = cat!.id;
    const [merchant] = await db.insert(merchants).values({ name: 'Zqx Mercadinho' }).returning({ id: merchants.id });

    const base = {
      accountId: accountA,
      descriptionRaw: 'COMPRA CARTAO',
      kind: 'expense' as const,
      paymentMethod: 'debit_card' as const,
    };
    await db.insert(transactions).values([
      // Casam (dentro dos 90 dias, naturezas categorizáveis)
      { ...base, date: TODAY, amountCents: -1500, description: 'Zqx Padaria Centro' },
      { ...base, date: FIRST_DAY, amountCents: -2000, description: 'ZQX PADÁRIA bairro' },
      { ...base, date: '2026-09-10', amountCents: -800, description: 'zqx padaria', categoryId, categorySource: 'user' },
      {
        ...base,
        date: '2026-09-05',
        amountCents: -900,
        description: 'Zqx Padaria',
        categoryId,
        userEditedFields: ['category'],
      },
      { ...base, date: '2026-09-01', amountCents: 500, kind: 'refund', description: 'Estorno zqx padaria' },
      // Descrição limpa diferente, mas a original do banco casa
      { ...base, date: '2026-08-20', amountCents: -3000, description: 'Outra coisa', descriptionRaw: 'ZQX PADARIA LTDA' },
      { ...base, date: '2026-08-01', amountCents: -4000, accountId: accountB, description: 'Zqx padaria conta B' },
      // Não casam
      { ...base, date: '2026-07-17', amountCents: -1000, description: 'Zqx padaria antiga' },
      { ...base, date: '2026-10-16', amountCents: -1000, description: 'Zqx padaria futura' },
      { ...base, date: '2026-09-02', amountCents: -1000, description: 'Zqx padaria excluída', deletedAt: new Date() },
      { ...base, date: '2026-09-03', amountCents: -1000, kind: 'transfer', description: 'Zqx padaria transferência' },
      { ...base, date: '2026-09-04', amountCents: -1000, status: 'projected', description: 'Zqx padaria projetada' },
      // Estabelecimento
      { ...base, date: '2026-10-01', amountCents: -2500, description: 'Compra no mercado', merchantId: merchant!.id },
    ]);
  });

  it('conta as transações dos últimos 90 dias até today, com exemplos das mais recentes', async () => {
    const p = ok(await getRulePreview(db, rule({}), { today: TODAY }));
    expect(p.days).toBe(90);
    expect(p.from).toBe(FIRST_DAY);
    expect(p.to).toBe(TODAY);
    expect(p.total).toBe(7);
    expect(p.samples).toHaveLength(5);
    expect(p.samples.map((s) => s.date)).toEqual(['2026-10-15', '2026-09-10', '2026-09-05', '2026-09-01', '2026-08-20']);
    expect(p.samples[0]).toMatchObject({ description: 'Zqx Padaria Centro', amountCents: -1500, userCategorized: false });
  });

  it('informa quantas têm categoria definida pelo usuário (R9)', async () => {
    const p = ok(await getRulePreview(db, rule({}), { today: TODAY }));
    expect(p.userCategorized).toBe(2);
    const byUser = p.samples.filter((s) => s.userCategorized);
    expect(byUser.map((s) => s.date)).toEqual(['2026-09-10', '2026-09-05']);
    expect(byUser[0]!.categoryName).toBe('Alimentação');
  });

  it('ignora excluídas, projetadas, naturezas sem categoria e datas fora da janela', async () => {
    const p = ok(await getRulePreview(db, rule({}), { today: TODAY, sampleLimit: 100 }));
    const descriptions = p.samples.map((s) => s.description);
    for (const d of ['antiga', 'futura', 'excluída', 'transferência', 'projetada']) {
      expect(descriptions.some((x) => x.includes(d))).toBe(false);
    }
  });

  it('respeita conta, faixa de valor (absoluto) e tipo de comparação', async () => {
    expect(ok(await getRulePreview(db, rule({ accountId: accountB }), { today: TODAY })).total).toBe(1);
    const range = ok(await getRulePreview(db, rule({ amountMinCents: 800, amountMaxCents: 1500 }), { today: TODAY }));
    expect(range.samples.map((s) => s.amountCents).sort((a, b) => a - b)).toEqual([-1500, -900, -800]);
    expect(ok(await getRulePreview(db, rule({ matchType: 'equals' }), { today: TODAY })).total).toBe(2);
    expect(ok(await getRulePreview(db, rule({ matchType: 'starts_with', pattern: 'estorno zqx' }), { today: TODAY })).total).toBe(1);
    expect(ok(await getRulePreview(db, rule({ matchType: 'regex', pattern: '^zqx padaria (centro|bairro)$' }), { today: TODAY })).total).toBe(2);
  });

  it('casa por estabelecimento', async () => {
    const p = ok(await getRulePreview(db, rule({ matchField: 'merchant', pattern: 'mercadinho' }), { today: TODAY }));
    expect(p.total).toBe(1);
    expect(p.samples[0]!.description).toBe('Compra no mercado');
  });

  it('padrão vazio e expressão regular inválida não consultam', async () => {
    expect(await getRulePreview(db, rule({ pattern: '   ' }), { today: TODAY })).toEqual({ status: 'empty' });
    expect(await getRulePreview(db, rule({ matchType: 'regex', pattern: '(' }), { today: TODAY })).toEqual({
      status: 'invalid_regex',
    });
  });

  it('sem nenhuma transação casando, devolve zero e nenhum exemplo', async () => {
    const p = ok(await getRulePreview(db, rule({ pattern: 'nada casa com isto 123' }), { today: TODAY }));
    expect(p).toMatchObject({ total: 0, userCategorized: 0, samples: [] });
  });
});
