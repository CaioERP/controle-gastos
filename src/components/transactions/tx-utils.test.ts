import { describe, expect, it } from 'vitest';
import type { CategoryTree } from '@/server/queries/catalog';
import type { TransactionRow } from '@/server/queries/transaction-row';
import {
  buildEditPatch,
  categoryGroupsFor,
  categoryKindFor,
  findCategory,
  formatDayHeader,
  groupByDay,
  isAutoSuggestion,
  suggestionLabel,
} from './tx-utils';

function row(partial: Partial<TransactionRow>): TransactionRow {
  return {
    id: 'x',
    date: '2026-10-15',
    description: 'Teste',
    descriptionRaw: 'TESTE',
    amountCents: -1000,
    kind: 'expense',
    paymentMethod: 'pix',
    status: 'posted',
    notes: null,
    needsReview: false,
    categorySource: 'default',
    categoryConfidence: null,
    category: null,
    merchant: null,
    account: { id: 'a', name: 'Conta', type: 'checking' },
    institution: { id: 'i', name: 'Banco', color: '#000000' },
    card: null,
    installment: null,
    tags: [],
    ...partial,
  };
}

function cat(partial: Partial<CategoryTree>): CategoryTree {
  return {
    id: 'c',
    parentId: null,
    name: 'Cat',
    slug: 'cat',
    kind: 'expense',
    icon: 'tag',
    color: '#111111',
    archived: false,
    isSystem: true,
    sortOrder: 0,
    transactionCount: 0,
    children: [],
    ...partial,
  };
}

describe('tx-utils', () => {
  it('natureza de categoria compatível com a natureza da transação (R8)', () => {
    expect(categoryKindFor('income')).toBe('income');
    expect(categoryKindFor('expense')).toBe('expense');
    expect(categoryKindFor('refund')).toBe('expense');
    for (const k of ['transfer', 'invoice_payment', 'investment', 'adjustment'] as const) {
      expect(categoryKindFor(k)).toBeNull();
    }
  });

  it('sugestão automática só para llm/provider, com a confiança no rótulo', () => {
    expect(isAutoSuggestion('llm')).toBe(true);
    expect(isAutoSuggestion('provider')).toBe(true);
    expect(isAutoSuggestion('user')).toBe(false);
    expect(isAutoSuggestion('merchant')).toBe(false);
    expect(suggestionLabel(0.65)).toBe('Sugestão automática (65%)');
    expect(suggestionLabel(null)).toBe('Sugestão automática');
  });

  it('cabeçalho do dia por extenso em pt-BR', () => {
    expect(formatDayHeader('2026-10-13')).toBe('ter, 13 de out');
    expect(formatDayHeader('2026-10-17')).toBe('sáb, 17 de out');
    expect(formatDayHeader('2027-01-04', true)).toBe('seg, 4 de jan de 2027');
  });

  it('agrupa por dia e soma só naturezas reportáveis e não previstas', () => {
    const groups = groupByDay([
      row({ id: '1', date: '2026-10-15', amountCents: -1000 }),
      row({ id: '2', date: '2026-10-15', amountCents: 50000, kind: 'income' }),
      row({ id: '3', date: '2026-10-15', amountCents: -20000, kind: 'transfer' }),
      row({ id: '4', date: '2026-10-14', amountCents: 300, kind: 'refund' }),
      row({ id: '5', date: '2026-10-14', amountCents: -4500, status: 'projected' }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-15', '2026-10-14']);
    expect(groups[0]!.balanceCents).toBe(49000);
    expect(groups[0]!.items).toHaveLength(3);
    expect(groups[1]!.balanceCents).toBe(300);
  });

  it('patch de edição só leva os campos alterados (R9)', () => {
    const tx = row({
      description: 'Uber',
      notes: null,
      tags: [{ id: 't1', name: 'Viagem', color: '#000000' }],
    });
    const same = { description: 'Uber', kind: tx.kind, paymentMethod: tx.paymentMethod, notes: '', tagIds: ['t1'] };
    expect(buildEditPatch(tx, same)).toEqual({});
    expect(buildEditPatch(tx, { ...same, description: '  Uber  ' })).toEqual({});
    expect(buildEditPatch(tx, { ...same, notes: ' trabalho ' })).toEqual({ notes: 'trabalho' });
    expect(buildEditPatch(tx, { ...same, kind: 'transfer' })).toEqual({ kind: 'transfer' });
    expect(buildEditPatch(tx, { ...same, tagIds: [] })).toEqual({ tagIds: [] });
    // Descrição vazia não é enviada (o comando exige ao menos 1 caractere)
    expect(buildEditPatch(tx, { ...same, description: '   ' })).toEqual({});
    // Limpar observação existente envia null
    expect(buildEditPatch({ ...tx, notes: 'antiga' }, same)).toEqual({ notes: null });
  });

  it('agrupa categorias por pai, separando por natureza e escondendo arquivadas', () => {
    const tree = [
      cat({
        id: 'food',
        name: 'Alimentação',
        children: [
          cat({ id: 'delivery', name: 'Delivery', parentId: 'food' }),
          cat({ id: 'old', name: 'Antiga', parentId: 'food', archived: true }),
        ],
      }),
      cat({ id: 'salary', name: 'Salário', kind: 'income' }),
      cat({ id: 'arch', name: 'Arquivada', archived: true }),
    ];
    const expense = categoryGroupsFor(tree, 'expense');
    expect(expense.map((g) => g.parent.id)).toEqual(['food']);
    expect(expense[0]!.children.map((c) => c.id)).toEqual(['delivery']);
    expect(expense[0]!.children[0]!.parentName).toBe('Alimentação');
    expect(categoryGroupsFor(tree, 'income').map((g) => g.parent.id)).toEqual(['salary']);
    expect(findCategory(tree, 'delivery')?.parentName).toBe('Alimentação');
    expect(findCategory(tree, 'nope')).toBeNull();
  });
});
