import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { loadFixtures } from '../../../tests/fixtures/load';
import { seedBase } from '@/server/db/seed';
import type { Db } from '@/server/db/client';
import { archiveCategory, upsertCategory } from '@/server/commands';
import { listCategories } from '@/server/queries/catalog';
import {
  appliedMessage,
  categoryOptionGroups,
  describeRule,
  formatAmountInput,
  hasCategoryOption,
  parentOptions,
  parseOptionalAmount,
  splitCategories,
} from './catalog-helpers';

describe('catalog-helpers (árvore real do seed)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: '2026-10-15', months: 6, seed: 42 });
  });

  it('separa despesas e receitas pelo kind, só com ativas', async () => {
    const { expense, income, archived } = splitCategories(await listCategories(db));
    expect(expense.map((c) => c.slug)).toContain('alimentacao');
    expect(income.map((c) => c.slug)).toContain('salario');
    expect(expense.every((c) => c.kind === 'expense')).toBe(true);
    expect(income.every((c) => c.kind === 'income')).toBe(true);
    expect(archived).toEqual([]);
  });

  it('subcategoria criada aparece sob o pai certo; arquivada sai da coluna e vai para o bloco de arquivadas', async () => {
    const roots = await listCategories(db);
    const alimentacao = roots.find((r) => r.slug === 'alimentacao')!;
    const { id } = await upsertCategory(db, {
      parentId: alimentacao.id,
      name: 'Café',
      kind: 'expense',
      icon: 'coffee',
      color: '#A16207',
    });

    let split = splitCategories(await listCategories(db));
    const parent = split.expense.find((r) => r.id === alimentacao.id)!;
    expect(parent.children.map((c) => c.name)).toContain('Café');
    const group = categoryOptionGroups(await listCategories(db)).find((g) => g.root.id === alimentacao.id)!;
    expect(group.children.map((c) => c.label)).toContain('Alimentação › Café');

    await archiveCategory(db, { categoryId: id, moveTransactionsTo: null });
    split = splitCategories(await listCategories(db));
    expect(split.expense.find((r) => r.id === alimentacao.id)!.children.map((c) => c.id)).not.toContain(id);
    expect(split.archived).toEqual([expect.objectContaining({ id, parentName: 'Alimentação', parentArchived: false })]);
    const groupsAfter = categoryOptionGroups(await listCategories(db));
    expect(groupsAfter.flatMap((g) => g.children.map((c) => c.id))).not.toContain(id);
    // Regra/estabelecimento apontando para a arquivada: o select precisa da opção extra "(arquivada)"
    expect(hasCategoryOption(groupsAfter, id)).toBe(false);
    expect(hasCategoryOption(groupsAfter, alimentacao.id)).toBe(true);
    expect(hasCategoryOption(groupsAfter, '')).toBe(true);
  });

  it('opções de pai: só raízes ativas do mesmo kind, sem a própria categoria', async () => {
    const roots = await listCategories(db);
    const alimentacao = roots.find((r) => r.slug === 'alimentacao')!;
    const options = parentOptions(roots, 'expense', alimentacao.id);
    expect(options.every((o) => o.kind === 'expense' && o.parentId === null)).toBe(true);
    expect(options.map((o) => o.id)).not.toContain(alimentacao.id);
    expect(parentOptions(roots, 'income').map((o) => o.slug)).toContain('salario');
  });
});

describe('catalog-helpers (funções puras)', () => {
  const base = { accountName: null, amountMinCents: null, amountMaxCents: null };

  it('descreve regras em linguagem natural', () => {
    expect(describeRule({ ...base, matchField: 'merchant', matchType: 'equals', pattern: 'Uber' })).toEqual({
      subject: 'Estabelecimento',
      verb: 'é',
      pattern: 'Uber',
      extras: [],
    });
    const full = describeRule({
      matchField: 'description',
      matchType: 'contains',
      pattern: 'padaria',
      accountName: 'Nubank',
      amountMinCents: 1000,
      amountMaxCents: 5000,
    });
    expect(full.subject).toBe('Descrição');
    expect(full.verb).toBe('contém');
    expect(full.extras[0]).toBe('só na conta Nubank');
    expect(full.extras[1]!.replace(/ /g, ' ')).toBe('valor entre R$ 10,00 e R$ 50,00');
    expect(describeRule({ ...base, matchField: 'description', matchType: 'starts_with', pattern: 'x', amountMaxCents: 990 }).extras[0]!.replace(/ /g, ' ')).toBe('valor até R$ 9,90');
  });

  it('converte valores opcionais do formulário em centavos', () => {
    expect(parseOptionalAmount('')).toBeNull();
    expect(parseOptionalAmount('  ')).toBeNull();
    expect(parseOptionalAmount('10')).toBe(1000);
    expect(parseOptionalAmount('10,5')).toBe(1050);
    expect(parseOptionalAmount('1.234,56')).toBe(123456);
    expect(parseOptionalAmount('abc')).toBeUndefined();
    expect(parseOptionalAmount('-5')).toBeUndefined();
    // Milhar em pt-BR sem vírgula
    expect(parseOptionalAmount('1.000')).toBe(100000);
    expect(parseOptionalAmount('1.234')).toBe(123400);
    expect(parseOptionalAmount('12.345.678')).toBe(1234567800);
    expect(parseOptionalAmount('R$ 1.000')).toBe(100000);
    expect(parseOptionalAmount('1.000,50')).toBe(100050);
    // Ponto que não é milhar continua decimal
    expect(parseOptionalAmount('10.5')).toBe(1050);
    expect(parseOptionalAmount('1.50')).toBe(150);
    expect(formatAmountInput(123456)).toBe('1234,56');
    expect(formatAmountInput(null)).toBe('');
  });

  it('mensagem de regra salva com a contagem no singular e no plural', () => {
    expect(appliedMessage(0)).toBe('Regra salva · 0 transações recategorizadas');
    expect(appliedMessage(1)).toBe('Regra salva · 1 transação recategorizada');
    expect(appliedMessage(12)).toBe('Regra salva · 12 transações recategorizadas');
  });
});
