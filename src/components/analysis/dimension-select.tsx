import * as React from 'react';
import Link from 'next/link';
import type { TxFilters } from '@/server/domain/filters';
import { ANALYSIS_DIMS, ANALYSIS_DIM_LABELS, type AnalysisDim } from '@/server/queries/analysis';
import { analysisHref } from './links';
import { cn } from '@/lib/utils';

type DimensionSelectProps = { value: AnalysisDim; filters: TxFilters };

/** Seletor da dimensão da evolução mensal (`dim` na URL), feito de links: funciona sem JavaScript. */
export function DimensionSelect({ value, filters }: DimensionSelectProps) {
  return (
    <nav
      aria-label="Dimensão da evolução"
      className="inline-flex flex-wrap items-center gap-1 rounded-lg border bg-muted/50 p-1"
    >
      {ANALYSIS_DIMS.map((dim) => (
        <Link
          key={dim}
          href={analysisHref(filters, {}, dim)}
          scroll={false}
          aria-current={dim === value ? 'true' : undefined}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dim === value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {ANALYSIS_DIM_LABELS[dim]}
        </Link>
      ))}
    </nav>
  );
}
