import { z } from 'zod';
import { PAYMENT_METHODS, type PaymentMethod } from '@/server/domain/enums';
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

/**
 * `parentIds`: informe ao quebrar por categoria EXATA ('category'). Um id de categoria pai no filtro
 * inclui as filhas, então a linha "transações lançadas direto no pai" não tem link que reproduza
 * só o seu valor e fica sem link.
 */
export type CategoryLinkOptions = { parentIds?: ReadonlySet<string> };

function categoryLinkable(categoryId: string, opts: CategoryLinkOptions): boolean {
  return isFilterableId(categoryId) && !opts.parentIds?.has(categoryId);
}

/** Link para /transacoes mantendo período, visão e regime atuais, filtrando pela categoria. */
export function categoryTransactionsHref(
  current: TxFilters,
  categoryId: string,
  opts: CategoryLinkOptions = {}
): string | null {
  if (!categoryLinkable(categoryId, opts)) return null;
  return withFilters('/transacoes', { categoryIds: [categoryId] }, current);
}

/** Link para /transacoes filtrando pela forma de pagamento. */
export function paymentMethodTransactionsHref(current: TxFilters, method: string): string | null {
  if (!isPaymentMethod(method)) return null;
  return withFilters('/transacoes', { paymentMethods: [method] }, current);
}

/** Link para /transacoes filtrando por categoria e forma de pagamento (célula da matriz). */
export function crossTransactionsHref(
  current: TxFilters,
  categoryId: string,
  method: string,
  opts: CategoryLinkOptions = {}
): string | null {
  if (!categoryLinkable(categoryId, opts) || !isPaymentMethod(method)) return null;
  return withFilters('/transacoes', { categoryIds: [categoryId], paymentMethods: [method] }, current);
}

/** Ids das categorias que têm filhas (para `CategoryLinkOptions.parentIds`). */
export function parentCategoryIds(tree: ReadonlyArray<{ id: string; children: ReadonlyArray<unknown> }>): Set<string> {
  return new Set(tree.filter((c) => c.children.length > 0).map((c) => c.id));
}
