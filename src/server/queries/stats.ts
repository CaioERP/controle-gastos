// Funções puras de apoio às telas analíticas. Este módulo NÃO pode importar '@/server/db' nem
// consultas: componentes (inclusive de cliente) importam daqui.
import { addMonthsISO, monthStart } from '@/server/domain/dates';
import type { Dimension, TxFilters } from '@/server/domain/filters';

/** Variação relativa (atual − anterior) / anterior. Anterior 0 → null (a UI mostra "—"). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Exatamente `months` meses, terminando no mês do fim do filtro (até `to`, inclusive). */
export function trailingMonthsRange(f: Pick<TxFilters, 'from' | 'to'>, months: number): { from: string; to: string } {
  return { from: monthStart(addMonthsISO(monthStart(f.to), -(months - 1))), to: f.to };
}

/**
 * Dimensão de categoria para quebras com link de drill-down. Com `cat` na URL, quebra por categoria
 * exata: assim o link de cada item (`cat=<item>`) nunca amplia o filtro atual.
 */
export function categoryDimensionFor(f: Pick<TxFilters, 'categoryIds'>): Extract<Dimension, 'category' | 'parentCategory'> {
  return f.categoryIds?.length ? 'category' : 'parentCategory';
}
