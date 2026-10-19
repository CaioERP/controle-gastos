import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import { formatPercentInt } from '@/components/charts/format';
import { percentChange } from '@/server/queries/dashboard';
import { cn } from '@/lib/utils';

export type KpiVariation = {
  current: number;
  previous: number;
  /** Rótulo do período anterior, ex.: "set/2026". */
  previousLabel: string;
  /** true para gastos (aumento em vermelho); false para receitas (aumento em verde). */
  increaseIsBad: boolean;
};

type KpiCardProps = {
  title: string;
  cents: number;
  colored?: boolean;
  hint?: React.ReactNode;
  variation?: KpiVariation;
};

export function KpiCard({ title, cents, colored = false, hint, variation }: KpiCardProps) {
  return (
    <Card size="sm" className="min-w-0" data-testid={`kpi-${slug(title)}`}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <Money cents={cents} colored={colored} className="block text-xl font-semibold sm:text-2xl" />
        {variation ? <Variation {...variation} /> : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function Variation({ current, previous, previousLabel, increaseIsBad }: KpiVariation) {
  const change = percentChange(current, previous);
  if (change === null) {
    return (
      <p className="text-xs text-muted-foreground tabular-nums">
        <span aria-label="sem base de comparação">—</span> vs {previousLabel}
      </p>
    );
  }
  if (change === 0) {
    return <p className="text-xs text-muted-foreground tabular-nums">= vs {previousLabel}</p>;
  }
  const up = change > 0;
  const bad = up === increaseIsBad;
  return (
    <p
      className={cn(
        'text-xs font-medium tabular-nums',
        bad ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
      )}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>{' '}
      <span className="sr-only">{up ? 'Aumento de' : 'Redução de'}</span>
      {formatPercentInt(Math.abs(change))} vs {previousLabel}
    </p>
  );
}

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
