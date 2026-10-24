import type { TxFilters } from '@/server/domain/filters';
import type { AnalysisDim } from '@/server/queries/analysis';
import { withFilters } from '@/server/queries/url-filters';

export type AnalysisSection = 'categorias' | 'formas' | 'lojas' | 'evolucao' | 'comparar';

export const VALID_ANALYSIS_SECTIONS: readonly AnalysisSection[] = [
  'categorias',
  'formas',
  'lojas',
  'evolucao',
  'comparar',
] as const;

export function parseAnalysisSection(param: unknown): AnalysisSection {
  const value = Array.isArray(param) ? param[0] : param;
  if (typeof value === 'string' && (VALID_ANALYSIS_SECTIONS as readonly string[]).includes(value)) {
    return value as AnalysisSection;
  }
  return 'categorias';
}

/** Link para /analise com filtros atualizados, preservando a dimensão da evolução (`dim`) e a seção (`secao`). */
export function analysisHref(
  current: TxFilters,
  patch: Partial<TxFilters> = {},
  dim: AnalysisDim = 'category',
  secao: AnalysisSection = 'categorias'
): string {
  const base = withFilters('/analise', patch, current);
  const url = new URL(base, 'http://localhost');
  if (dim && dim !== 'category') {
    url.searchParams.set('dim', dim);
  }
  if (secao && secao !== 'categorias') {
    url.searchParams.set('secao', secao);
  }
  const search = url.searchParams.toString();
  return search ? `/analise?${search}` : '/analise';
}
