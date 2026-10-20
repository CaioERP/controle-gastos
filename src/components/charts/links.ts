import { z } from 'zod';
import { PAYMENT_METHODS, REPORTABLE_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import type { TxFilters } from '@/server/domain/filters';
import { withFilters } from '@/server/queries/url-filters';

const uuid = z.string().uuid();

/** Chaves de agregados ("uncategorized", "outras", "none") não são filtráveis. */
export function isFilterableId(key: string): boolean {
  return uuid.safeParse(key).success;
}

export function isPaymentMethod(key: string): key is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(key);
}

/** Naturezas que entram no valor de gasto dos gráficos (`spendValue`): despesa soma, estorno abate. */
const SPEND_KINDS: readonly TxKind[] = ['expense', 'refund'];

/**
 * Naturezas que o gráfico de gasto somou com os filtros atuais (R2). O link manda isso explicitamente,
 * porque a lista de transações, sem `natureza`, mostra todas as naturezas.
 */
export function spendKinds(current: TxFilters): TxKind[] {
  const allowed = current.kinds ?? REPORTABLE_KINDS;
  return SPEND_KINDS.filter((k) => allowed.includes(k));
}

/**
 * `parentIds`: informe ao quebrar por categoria EXATA ('category'). Um id de categoria pai no filtro
 * inclui as filhas, então a linha "transações lançadas direto no pai" não tem link que reproduza
 * só o seu valor e fica sem link.
 */
export type CategoryLinkOptions = { parentIds?: ReadonlySet<string> };

function categoryLinkable(categoryId: string, opts: CategoryLinkOptions): boolean {
  return isFilterableId(categoryId) && !opts.parentIds?.has(categoryId);
}

function transactionsHref(current: TxFilters, patch: Partial<TxFilters>): string | null {
  const kinds = spendKinds(current);
  if (kinds.length === 0) return null;
  return withFilters('/transacoes', { ...patch, kinds }, current);
}

/** Link para /transacoes mantendo período, visão e regime atuais, filtrando pela categoria. */
export function categoryTransactionsHref(
  current: TxFilters,
  categoryId: string,
  opts: CategoryLinkOptions = {}
): string | null {
  if (!categoryLinkable(categoryId, opts)) return null;
  return transactionsHref(current, { categoryIds: [categoryId] });
}

/** Link para /transacoes filtrando pela forma de pagamento. */
export function paymentMethodTransactionsHref(current: TxFilters, method: string): string | null {
  if (!isPaymentMethod(method)) return null;
  return transactionsHref(current, { paymentMethods: [method] });
}

/** Link para /transacoes filtrando por categoria e forma de pagamento (célula da matriz). */
export function crossTransactionsHref(
  current: TxFilters,
  categoryId: string,
  method: string,
  opts: CategoryLinkOptions = {}
): string | null {
  if (!categoryLinkable(categoryId, opts) || !isPaymentMethod(method)) return null;
  return transactionsHref(current, { categoryIds: [categoryId], paymentMethods: [method] });
}

/** Ids das categorias que têm filhas (para `CategoryLinkOptions.parentIds`). */
export function parentCategoryIds(tree: ReadonlyArray<{ id: string; children: ReadonlyArray<unknown> }>): Set<string> {
  return new Set(tree.filter((c) => c.children.length > 0).map((c) => c.id));
}
