import * as React from 'react';
import { MonthlyChart } from '@/components/charts/monthly-chart';
import { monthlyChartData } from '@/components/charts/monthly-data';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { MonthlySeriesResult } from '@/server/queries/monthly';

/** Evolução mensal empilhada por categoria (últimos 6 meses até o fim do período). */
export function MonthlyStacked({ series }: { series: MonthlySeriesResult }) {
  const data = monthlyChartData(series);
  return <MonthlyChart points={data.points} series={data.series} mode="stacked" />;
}

export function MonthlyStackedSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card p-4 sm:p-6 h-64 flex flex-col justify-between',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex items-end justify-between gap-3 h-40 pt-4">
        {[45, 70, 55, 90, 60, 85].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}
