import type { RuleInput } from '@/server/commands/rules';
import type { CategoryKind } from '@/server/domain/enums';
import { formatBRL, toCents } from '@/server/domain/money';
import type { CategoryTree, RuleRow } from '@/server/queries/catalog';

/** Funções puras da tela de categorias, regras e estabelecimentos (testadas em catalog-helpers.test.ts). */

/** `parentArchived`: subcategoria de uma raiz arquivada — restaure a raiz antes, senão ela some das colunas. */
export type ArchivedCategory = CategoryTree & { parentName: string | null; parentArchived: boolean };

/** Separa a árvore em colunas Despesas/Receitas (só ativas) e a lista plana de arquivadas. */
export function splitCategories(roots: CategoryTree[]): {
  expense: CategoryTree[];
  income: CategoryTree[];
  archived: ArchivedCategory[];
} {
  const archived: ArchivedCategory[] = [];
  const active = (kind: CategoryKind) =>
    roots
      .filter((r) => r.kind === kind && !r.archived)
      .map((r) => ({ ...r, children: r.children.filter((c) => !c.archived) }));

  for (const root of roots) {
    if (root.archived) archived.push({ ...root, parentName: null, parentArchived: false });
    for (const child of root.children) {
      if (child.archived) archived.push({ ...child, parentName: root.name, parentArchived: root.archived });
    }
  }
  return { expense: active('expense'), income: active('income'), archived };
}

/** Raízes ativas do mesmo `kind` que podem ser pai (R8: máximo 2 níveis), sem a própria categoria. */
export function parentOptions(roots: CategoryTree[], kind: CategoryKind, editingId?: string): CategoryTree[] {
  return roots.filter((r) => r.kind === kind && !r.archived && r.id !== editingId);
}

export type CategoryOption = { id: string; label: string; kind: CategoryKind };
export type CategoryOptionGroup = { root: CategoryOption; children: CategoryOption[] };

/** Categorias ativas agrupadas por raiz, para os selects de categoria. */
export function categoryOptionGroups(roots: CategoryTree[], kind?: CategoryKind): CategoryOptionGroup[] {
  return roots
    .filter((r) => !r.archived && (!kind || r.kind === kind))
    .map((r) => ({
      root: { id: r.id, label: r.name, kind: r.kind },
      children: r.children
        .filter((c) => !c.archived)
        .map((c) => ({ id: c.id, label: `${r.name} › ${c.name}`, kind: c.kind })),
    }));
}

/** true se o id está entre as opções ativas (raiz ou filha). Vazio conta como presente. */
export function hasCategoryOption(groups: CategoryOptionGroup[], id: string): boolean {
  return id === '' || groups.some((g) => g.root.id === id || g.children.some((c) => c.id === id));
}

const MATCH_LABELS: Record<RuleRow['matchType'], string> = {
  contains: 'contém',
  starts_with: 'começa com',
  equals: 'é',
  regex: 'casa com a expressão',
};

export type RuleDescription = { subject: string; verb: string; pattern: string; extras: string[] };

/** Condição da regra em linguagem natural ("Estabelecimento é Uber", "+ só na conta Nubank"...). */
export function describeRule(
  rule: Pick<RuleRow, 'matchField' | 'matchType' | 'pattern' | 'accountName' | 'amountMinCents' | 'amountMaxCents'>,
): RuleDescription {
  const extras: string[] = [];
  if (rule.accountName) extras.push(`só na conta ${rule.accountName}`);
  const { amountMinCents: min, amountMaxCents: max } = rule;
  if (min !== null && max !== null) extras.push(`valor entre ${formatBRL(min)} e ${formatBRL(max)}`);
  else if (min !== null) extras.push(`valor a partir de ${formatBRL(min)}`);
  else if (max !== null) extras.push(`valor até ${formatBRL(max)}`);

  return {
    subject: rule.matchField === 'merchant' ? 'Estabelecimento' : 'Descrição',
    verb: MATCH_LABELS[rule.matchType],
    pattern: rule.pattern,
    extras,
  };
}

/**
 * Campo opcional de valor em reais ("10", "10,50", "1.234,56") → centavos positivos.
 * Vazio → null. Inválido ou negativo → undefined (o formulário mostra o erro).
 */
export function parseOptionalAmount(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/R\$|\s/g, '');
  if (trimmed === '') return null;
  // pt-BR: ponto sem vírgula seguido de grupos de 3 dígitos é separador de milhar ("1.000" = mil reais).
  // toCents (domínio) leria como decimal, então os pontos saem antes.
  const normalized = /^\d{1,3}(\.\d{3})+$/.test(trimmed) ? trimmed.replace(/\./g, '') : trimmed;
  try {
    const cents = toCents(normalized);
    return cents >= 0 ? cents : undefined;
  } catch {
    return undefined;
  }
}

export function appliedMessage(applied: number): string {
  return `Regra salva · ${applied} ${applied === 1 ? 'transação recategorizada' : 'transações recategorizadas'}`;
}

/** Linha da tabela → entrada do comando (usada pelo switch "ativa"). */
export function ruleToInput(rule: RuleRow): RuleInput {
  return {
    id: rule.id,
    priority: rule.priority,
    matchField: rule.matchField,
    matchType: rule.matchType,
    pattern: rule.pattern,
    accountId: rule.accountId,
    amountMinCents: rule.amountMinCents,
    amountMaxCents: rule.amountMaxCents,
    setCategoryId: rule.setCategoryId,
    setKind: rule.setKind,
    setPaymentMethod: rule.setPaymentMethod,
    enabled: rule.enabled,
  };
}

/** Campos do formulário que decidem a prévia da regra (valores como texto). */
export type RulePreviewFields = Pick<RuleInput, 'matchField' | 'matchType'> & {
  pattern: string;
  accountId: string;
  amountMin: string;
  amountMax: string;
};

/**
 * Formulário → entrada da prévia. `null`: sem texto, nada a mostrar ainda.
 * `'invalid_amount'`: faixa de valor inválida (o formulário já avisa ao salvar).
 */
export function previewInputFrom(
  f: RulePreviewFields,
): Pick<RuleInput, 'matchField' | 'matchType' | 'pattern' | 'accountId' | 'amountMinCents' | 'amountMaxCents'> | 'invalid_amount' | null {
  const pattern = f.pattern.trim();
  if (!pattern) return null;
  const min = parseOptionalAmount(f.amountMin);
  const max = parseOptionalAmount(f.amountMax);
  if (min === undefined || max === undefined || (min !== null && max !== null && min > max)) return 'invalid_amount';
  return {
    matchField: f.matchField,
    matchType: f.matchType,
    pattern,
    accountId: f.accountId || null,
    amountMinCents: min,
    amountMaxCents: max,
  };
}

/** "Esta regra casaria com 3 transações dos últimos 90 dias" (singular para 1). */
export function previewMessage(total: number, days: number): string {
  return `Esta regra casaria com ${total} ${total === 1 ? 'transação' : 'transações'} dos últimos ${days} dias`;
}

/** Aviso de R9: transações com categoria do usuário não mudam. Vazio quando não há nenhuma. */
export function previewUserNote(userCategorized: number): string {
  if (userCategorized === 0) return '';
  return userCategorized === 1
    ? '1 delas tem categoria definida por você e não será alterada.'
    : `${userCategorized} delas têm categoria definida por você e não serão alteradas.`;
}

/** Centavos → texto editável no formulário ("1234,56"); null → "". */
export function formatAmountInput(cents: number | null): string {
  if (cents === null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}
