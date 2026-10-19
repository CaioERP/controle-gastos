'use client';

import * as React from 'react';
import { MonthlyChart, type MonthlyPoint, type MonthlySeries } from '@/components/charts/monthly-chart';
import { cn } from '@/lib/utils';

type MonthlyEvolutionProps = { points: MonthlyPoint[]; series: MonthlySeries[] };

const MODES = [
  { value: 'stacked', label: 'Barras empilhadas' },
  { value: 'lines', label: 'Linhas' },
] as const;

/** Evolução mensal (12 meses) com alternância entre barras empilhadas e linhas. */
export function MonthlyEvolution({ points, series }: MonthlyEvolutionProps) {
  const [mode, setMode] = React.useState<'stacked' | 'lines'>('stacked');
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Tipo de gráfico" className="inline-flex rounded-lg border bg-muted/50 p-1">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              'cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              mode === m.value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <MonthlyChart points={points} series={series} mode={mode} />
    </div>
  );
}
