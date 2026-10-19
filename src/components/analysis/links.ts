import type { TxFilters } from '@/server/domain/filters';
import type { AnalysisDim } from '@/server/queries/analysis';
import { withFilters } from '@/server/queries/url-filters';

/** Link para /analise com filtros atualizados, preservando a dimensão da evolução (`dim`). */
export function analysisHref(current: TxFilters, patch: Partial<TxFilters>, dim: AnalysisDim): string {
  const base = withFilters('/analise', patch, current);
  if (dim === 'category') return base;
  return `${base}${base.includes('?') ? '&' : '?'}dim=${dim}`;
}
