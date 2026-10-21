import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import { cn } from '@/lib/utils';

type LimitsSummaryCardsProps = {
  totalBudgetedCents: number;
  totalSpentCents: number;
  spentPercent: number;
  limitsCount: number;
  warningCount: number;
  exceededCount: number;
};

export function LimitsSummaryCards({
  totalBudgetedCents,
  totalSpentCents,
  spentPercent,
  limitsCount,
  warningCount,
  exceededCount,
}: LimitsSummaryCardsProps) {
  const progressBarColor =
    spentPercent >= 100
      ? 'bg-rose-500'
      : spentPercent >= 80
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Total Orçado */}
      <Card size="sm" className="min-w-0" data-testid="kpi-total-orcado">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Orçado no Mês
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money cents={totalBudgetedCents} className="block text-xl font-semibold sm:text-2xl" />
          <p className="text-xs text-muted-foreground">
            {limitsCount} {limitsCount === 1 ? 'meta ativa' : 'metas ativas'}
          </p>
        </CardContent>
      </Card>

      {/* 2. Total Gasto */}
      <Card size="sm" className="min-w-0" data-testid="kpi-total-gasto">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Gasto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Money cents={totalSpentCents} className="text-xl font-semibold sm:text-2xl" />
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                spentPercent >= 100
                  ? 'text-rose-600 dark:text-rose-400'
                  : spentPercent >= 80
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {spentPercent}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full transition-all duration-300', progressBarColor)}
              style={{ width: `${Math.min(100, Math.max(0, spentPercent))}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Limites em Alerta */}
      <Card size="sm" className="min-w-0" data-testid="kpi-limites-alerta">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Em Alerta (80–99%)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <span
            className={cn(
              'block text-xl font-semibold tabular-nums sm:text-2xl',
              warningCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
            )}
          >
            {warningCount}
          </span>
          <p className="text-xs text-muted-foreground">
            {warningCount === 1 ? '1 meta próxima do teto' : `${warningCount} metas próximas do teto`}
          </p>
        </CardContent>
      </Card>

      {/* 4. Limites Ultrapassados */}
      <Card size="sm" className="min-w-0" data-testid="kpi-limites-ultrapassados">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ultrapassados (100%+)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <span
            className={cn(
              'block text-xl font-semibold tabular-nums sm:text-2xl',
              exceededCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground',
            )}
          >
            {exceededCount}
          </span>
          <p className="text-xs text-muted-foreground">
            {exceededCount === 1 ? '1 meta estourada' : `${exceededCount} metas estouradas`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
