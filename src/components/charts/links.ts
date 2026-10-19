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

/** Link para /transacoes mantendo período, visão e regime atuais, filtrando pela categoria. */
export function categoryTransactionsHref(current: TxFilters, categoryId: string): string | null {
  if (!isFilterableId(categoryId)) return null;
  return withFilters('/transacoes', { categoryIds: [categoryId] }, current);
}

/** Link para /transacoes filtrando pela forma de pagamento. */
export function paymentMethodTransactionsHref(current: TxFilters, method: string): string | null {
  if (!isPaymentMethod(method)) return null;
  return withFilters('/transacoes', { paymentMethods: [method] }, current);
}

/** Link para /transacoes filtrando por categoria e forma de pagamento (célula da matriz). */
export function crossTransactionsHref(current: TxFilters, categoryId: string, method: string): string | null {
  if (!isFilterableId(categoryId) || !isPaymentMethod(method)) return null;
  return withFilters('/transacoes', { categoryIds: [categoryId], paymentMethods: [method] }, current);
}
