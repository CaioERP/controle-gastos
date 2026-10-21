import * as React from 'react';
import Link from 'next/link';
import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Money } from '@/components/format/money';
import type { LimitsOverview } from '@/server/queries/limits';
import { cn } from '@/lib/utils';

type DashboardLimitsWidgetProps = {
  overview: LimitsOverview;
};

export function DashboardLimitsWidget({ overview }: DashboardLimitsWidgetProps) {
  // Limites ativos ordenados por maior proximidade do teto ou estourados
  const activeLimits = overview.limits.filter((l) => l.isActive).slice(0, 4);

  return (
    <Card size="sm" className="min-w-0" data-testid="dashboard-limits-widget">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">Metas e Limites</CardTitle>
        </div>
        <Link
          href="/limites"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Ver todas
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeLimits.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Nenhuma meta ativa cadastrada no momento.
            </p>
            <Link
              href="/limites"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-2 text-xs h-7')}
            >
              Definir meta
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {activeLimits.map((limit) => {
              const progressBarColor =
                limit.status === 'exceeded'
                  ? 'bg-rose-500'
                  : limit.status === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';

              const percentColor =
                limit.status === 'exceeded'
                  ? 'text-rose-600 dark:text-rose-400'
                  : limit.status === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground';

              return (
                <div key={limit.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      {limit.categoryColor && (
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: limit.categoryColor }}
                        />
                      )}
                      <span className="font-medium text-foreground truncate">{limit.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                      <span className={cn('font-semibold', percentColor)}>
                        {limit.spentPercent}%
                      </span>
                    </div>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full transition-all duration-300', progressBarColor)}
                      style={{ width: `${Math.min(100, Math.max(0, limit.spentPercent))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      <Money cents={limit.spentCents} /> de <Money cents={limit.amountCents} />
                    </span>
                    {limit.paceStatus === 'accelerated' && limit.projectedExceedDays !== null && (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        Ritmo alto ({limit.projectedExceedDays}d)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
