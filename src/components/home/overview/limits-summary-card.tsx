import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Money } from '@/components/format/money';
import { limitStatus } from '@/server/queries/limits';
import type { MonthlyLimitsSummary } from '@/server/home/limits-summary';
import { cn } from '@/lib/utils';

export type LimitsSummaryCardProps = {
  summary: MonthlyLimitsSummary;
  className?: string;
};

export function LimitsSummaryCard({ summary, className }: LimitsSummaryCardProps) {
  if (summary.considered === 0) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Metas do mês</CardTitle>
          <Link href="/limites" className="text-xs text-muted-foreground hover:underline">
            Ver todas
          </Link>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Defina metas mensais por categoria para acompanhar aqui
          </p>
          <Link href="/limites" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Definir metas
          </Link>
        </CardContent>
      </Card>
    );
  }

  const status = limitStatus(summary.spentPercent);
  const progressBarColor =
    status === 'exceeded'
      ? 'bg-red-500'
      : status === 'warning'
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Metas do mês</CardTitle>
        <Link href="/limites" className="text-xs text-muted-foreground hover:underline">
          Ver todas
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="text-sm">
              <Money cents={summary.spentCents} className="font-bold text-base text-foreground" />
              <span className="text-muted-foreground"> de </span>
              <Money cents={summary.budgetedCents} className="text-muted-foreground" />
              <span className="text-muted-foreground"> ({summary.spentPercent}%)</span>
            </div>
            {summary.exceededCount > 0 && (
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                {summary.exceededCount} {summary.exceededCount === 1 ? 'estourada' : 'estouradas'}
              </span>
            )}
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', progressBarColor)}
              style={{ width: `${Math.min(100, summary.spentPercent)}%` }}
            />
          </div>
        </div>

        {summary.critical.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            {summary.critical.slice(0, 3).map((item) => {
              const itemStatus = limitStatus(item.spentPercent);
              const itemColor =
                itemStatus === 'exceeded'
                  ? 'bg-red-500'
                  : itemStatus === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';
              return (
                <Link
                  key={item.id}
                  href={item.actionUrl}
                  className="group block space-y-1 rounded-md p-1.5 -mx-1.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.categoryColor ?? '#6B7280' }}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{item.categoryName ?? item.name}</span>
                    </div>
                    <div className="text-muted-foreground shrink-0 tabular-nums">
                      <Money cents={item.spentCents} /> / <Money cents={item.amountCents} />
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', itemColor)}
                      style={{ width: `${Math.min(100, item.spentPercent)}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
