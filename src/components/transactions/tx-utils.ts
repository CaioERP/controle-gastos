import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CategoryKind, CategorySource, PaymentMethod, Source, TxKind, TxStatus } from '@/server/domain/enums';
import { REPORTABLE_KINDS } from '@/server/domain/enums';
import type { CategoryTree } from '@/server/queries/catalog';
import type { TransactionRow } from '@/server/queries/transaction-row';

/**
 * Natureza de categoria aceita por cada natureza de transação (R8 + validação de `recategorize`):
 * receita → categorias de receita; despesa/estorno → categorias de despesa; demais naturezas não têm categoria.
 */
export function categoryKindFor(kind: TxKind): CategoryKind | null {
  if (kind === 'income') return 'income';
  if (kind === 'expense' || kind === 'refund') return 'expense';
  return null;
}

export function isReportable(kind: TxKind): boolean {
  return REPORTABLE_KINDS.includes(kind);
}

/** Categoria escolhida pela automação (IA ou fonte), ainda não confirmada pelo usuário. */
export function isAutoSuggestion(source: CategorySource): boolean {
  return source === 'llm' || source === 'provider';
}

/** Confiança abaixo deste valor ganha o ícone de alerta. */
export const LOW_CONFIDENCE = 0.8;

export function formatConfidence(confidence: number | null): string {
  if (confidence === null) return '';
  return `${Math.round(confidence * 100)}%`;
}

export function suggestionLabel(confidence: number | null): string {
  const pct = formatConfidence(confidence);
  return pct ? `Sugestão automática (${pct})` : 'Sugestão automática';
}

// O locale ptBR do date-fns abrevia "sáb" sem acento; usamos a lista própria.
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "2026-10-13" → "ter, 13 de out" (com `withYear`: "ter, 13 de out de 2026") */
export function formatDayHeader(date: string, withYear = false): string {
  const d = parseISO(date);
  const pattern = withYear ? "d 'de' MMM 'de' yyyy" : "d 'de' MMM";
  return `${WEEKDAYS[d.getDay()]}, ${format(d, pattern, { locale: ptBR })}`;
}

export type DayGroup = { date: string; items: TransactionRow[]; balanceCents: number };

/**
 * Agrupa por dia mantendo a ordem recebida. O saldo do dia soma só as naturezas reportáveis (R2)
 * e ignora parcelas previstas, que ainda não aconteceram.
 */
export function groupByDay(items: TransactionRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== item.date) {
      group = { date: item.date, items: [], balanceCents: 0 };
      groups.push(group);
    }
    group.items.push(item);
    if (isReportable(item.kind) && item.status !== 'projected') group.balanceCents += item.amountCents;
  }
  return groups;
}

export type FlatCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
  parentName: string | null;
};

export type CategoryGroup = { parent: FlatCategory; children: FlatCategory[] };

/** Categorias ativas de uma natureza, agrupadas pela categoria pai (pai também é selecionável). */
export function categoryGroupsFor(tree: CategoryTree[], kind: CategoryKind): CategoryGroup[] {
  return tree
    .filter((root) => root.kind === kind && !root.archived)
    .map((root) => ({
      parent: { id: root.id, name: root.name, color: root.color, icon: root.icon, parentName: null },
      children: root.children
        .filter((c) => !c.archived)
        .map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, parentName: root.name })),
    }));
}

export function findCategory(tree: CategoryTree[], id: string): FlatCategory | null {
  for (const root of tree) {
    if (root.id === id) return { id: root.id, name: root.name, color: root.color, icon: root.icon, parentName: null };
    for (const c of root.children) {
      if (c.id === id) return { id: c.id, name: c.name, color: c.color, icon: c.icon, parentName: root.name };
    }
  }
  return null;
}

export const CATEGORY_SOURCE_LABELS: Record<CategorySource, string> = {
  user: 'Você',
  rule: 'Regra',
  merchant: 'Memória do estabelecimento',
  provider: 'Sugestão da fonte',
  llm: 'Sugestão da IA',
  default: 'Padrão',
};

export const SOURCE_LABELS: Record<Source, string> = {
  pluggy: 'Open Finance (Pluggy)',
  file: 'Arquivo importado',
  email: 'E-mail',
  manual: 'Lançamento manual',
};

export const TX_STATUS_LABELS: Record<TxStatus, string> = {
  posted: 'Lançada',
  pending: 'Pendente',
  projected: 'Prevista',
};

export type EditForm = {
  description: string;
  kind: TxKind;
  paymentMethod: PaymentMethod;
  notes: string;
  tagIds: string[];
};

export type EditPatch = Partial<{
  description: string;
  kind: TxKind;
  paymentMethod: PaymentMethod;
  notes: string | null;
  tagIds: string[];
}>;

function normalizeNotes(notes: string | null): string | null {
  const trimmed = notes?.trim() ?? '';
  return trimmed ? trimmed : null;
}

/**
 * Monta o patch de `updateTransaction` só com o que mudou: cada campo enviado entra em
 * `user_edited_fields` e passa a ser protegido da sincronização (R9), então não podemos enviar o resto.
 */
export function buildEditPatch(tx: TransactionRow, form: EditForm): EditPatch {
  const patch: EditPatch = {};
  // Compara com os valores originais normalizados: espaço nas pontas e '' x null não contam como edição.
  const description = form.description.trim();
  if (description && description !== tx.description.trim()) patch.description = description;
  if (form.kind !== tx.kind) patch.kind = form.kind;
  if (form.paymentMethod !== tx.paymentMethod) patch.paymentMethod = form.paymentMethod;
  const notes = normalizeNotes(form.notes);
  if (notes !== normalizeNotes(tx.notes)) patch.notes = notes;
  const before = tx.tags.map((t) => t.id).sort().join(',');
  if ([...form.tagIds].sort().join(',') !== before) patch.tagIds = form.tagIds;
  return patch;
}

export function pluralTransactions(n: number): string {
  return n === 1 ? '1 transação' : `${n} transações`;
}
