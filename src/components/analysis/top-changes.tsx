import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';
import { formatPercentInt } from '@/components/charts/format';
import { analysisHref } from './links';
import type { TxFilters } from '@/server/domain/filters';
import type { PeriodComparisonRow } from '@/server/queries/analysis';
import { cn } from '@/lib/utils';

type TopChangesProps = {
  rows: PeriodComparisonRow[];
  previousLabel: string;
  filters: TxFilters;
};

/**
 * Top 5 categorias com maior diferença absoluta entre o período atual e o anterior.
 * Aumento de gasto em vermelho; queda em verde.
 */
export function TopChanges({ rows, previousLabel, filters }: TopChangesProps) {
  const top = [...rows]
    .filter((r) => r.diffCents !== 0)
    .sort((a, b) => Math.abs(b.diffCents) - Math.abs(a.diffCents))
    .slice(0, 5);

  return (
    <section aria-label={`O que mais mudou desde ${previousLabel}`} className="space-y-3">
      <h2 className="text-base font-semibold tracking-tight text-foreground">
        O que mais mudou desde {previousLabel}
      </h2>

      {top.length === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">Sem variações significativas no período.</p>
      ) : (
        <ul className="divide-y divide-border/40 text-sm">
          {top.map((r) => {
            const isIncrease = r.diffCents > 0;
            const changePercent =
              r.change !== null
                ? formatPercentInt(Math.abs(r.change))
                : isIncrease
                  ? 'novo'
                  : 'zerou';

            return (
              <li key={r.key} className="flex h-10 items-center justify-between gap-3 py-1">
                <span className="truncate text-foreground font-medium">{r.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <strong className="font-semibold text-foreground">
                    <Money cents={r.diffCents} signed />
                  </strong>
                  <span
                    className={cn(
                      'inline-block w-16 text-right text-xs font-semibold tabular-nums',
                      isIncrease
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    )}
                  >
                    {isIncrease ? '▲' : '▼'} {changePercent}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <Link
          href={analysisHref(filters, {}, 'category', 'comparar')}
          className="inline-block text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          Comparar todas as categorias
        </Link>
      </div>
    </section>
  );
}
