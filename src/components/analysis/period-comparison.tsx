import * as React from 'react';
import { Money } from '@/components/format/money';
import { formatPercentInt } from '@/components/charts/format';
import type { PeriodComparisonRow } from '@/server/queries/analysis';
import { cn } from '@/lib/utils';

type PeriodComparisonProps = { rows: PeriodComparisonRow[]; previousLabel: string };

/**
 * Atual × anterior por categoria, com barra divergente a partir do centro:
 * aumento de gasto para a direita em vermelho, redução para a esquerda em verde.
 */
export function PeriodComparison({ rows, previousLabel }: PeriodComparisonProps) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem gastos nos dois períodos.</p>;
  }
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.diffCents)));
  return (
    <ul className="space-y-3" aria-label={`Comparação com ${previousLabel}`}>
      {rows.map((r) => {
        const up = r.diffCents > 0;
        const half = (Math.abs(r.diffCents) / maxAbs) * 50;
        const tone = up ? 'text-red-600 dark:text-red-400' : r.diffCents < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground';
        return (
          <li key={r.key} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? '#9CA3AF' }} />
                <span className="truncate">{r.label}</span>
              </span>
              <span className={cn('shrink-0 text-xs font-medium tabular-nums', tone)}>
                {r.diffCents === 0 ? '=' : <Money cents={r.diffCents} signed className="font-medium" />}
                <span className="ml-1.5">
                  {r.change === null ? '—' : r.diffCents === 0 ? '' : `${up ? '▲' : '▼'} ${formatPercentInt(Math.abs(r.change))}`}
                </span>
              </span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-muted" aria-hidden>
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {r.diffCents !== 0 ? (
                <div
                  className={cn('absolute inset-y-0', up ? 'left-1/2 rounded-r-full bg-red-500' : 'right-1/2 rounded-l-full bg-emerald-500')}
                  style={{ width: `${half}%` }}
                />
              ) : null}
            </div>
            <div className="mt-0.5 flex justify-between text-xs text-muted-foreground">
              <span>
                {previousLabel}: <Money cents={r.previousCents} className="font-normal" />
              </span>
              <span>
                atual: <Money cents={r.currentCents} className="font-normal" />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
