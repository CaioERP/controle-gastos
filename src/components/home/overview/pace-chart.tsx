'use client';

import * as React from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Money, Sensitive } from '@/components/format/money';
import { formatBRL } from '@/server/domain/money';
import { formatBRLCompact, formatPercentInt } from '@/components/charts/format';
import type { SpendingPace } from '@/server/home/pace';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { addMonthsISO } from '@/server/domain/dates';
import { cn } from '@/lib/utils';

export type PaceChartProps = {
  pace: SpendingPace;
  from: string;
  className?: string;
};

export function PaceChart({ pace, from, className }: PaceChartProps) {
  const parsedFrom = parseISO(from);
  const currentMonthName = format(parsedFrom, 'MMMM', { locale: ptBR });
  const prevMonthDate = parseISO(addMonthsISO(from, -1));
  const prevMonthName = format(prevMonthDate, 'MMMM', { locale: ptBR });

  let variationEl: React.ReactNode = null;
  if (pace.variationPercent !== null) {
    const isUp = pace.variationPercent > 0;
    const isDown = pace.variationPercent < 0;
    const arrow = isUp ? '▲' : isDown ? '▼' : '=';
    const colorClass = isUp
      ? 'text-red-600 dark:text-red-400'
      : isDown
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

    variationEl = (
      <span className={cn('text-xs font-semibold tabular-nums', colorClass)}>
        {arrow} {formatPercentInt(Math.abs(pace.variationPercent))} vs mesmo dia de {prevMonthName}
      </span>
    );
  }

  const chartConfig = {
    currentCents: {
      label: `Mês atual (${currentMonthName})`,
      color: 'var(--primary)',
    },
    previousCents: {
      label: `Mês anterior (${prevMonthName})`,
      color: '#9CA3AF',
    },
  } satisfies ChartConfig;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Gastos em {currentMonthName}
        </CardTitle>
        <div className="flex items-baseline gap-3 flex-wrap">
          <Money cents={pace.currentTotalCents} className="text-2xl sm:text-3xl font-bold tracking-tight" />
          {variationEl}
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-56 w-full" data-sensitive-axis>
          <LineChart data={pace.points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={12}
              className="text-muted-foreground"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={formatBRLCompact}
              fontSize={12}
              className="text-muted-foreground"
            />
            <ChartTooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const currentVal = payload.find((p) => p.dataKey === 'currentCents')?.value as
                  | number
                  | undefined
                  | null;
                const prevVal = payload.find((p) => p.dataKey === 'previousCents')?.value as
                  | number
                  | undefined;

                return (
                  <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs space-y-1">
                    <p className="font-semibold text-foreground">Dia {label}</p>
                    {currentVal !== undefined && currentVal !== null && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground flex items-center gap-1.5 capitalize">
                          <span className="size-2 rounded-full bg-primary" aria-hidden />
                          {currentMonthName}
                        </span>
                        <span className="font-medium text-foreground">
                          <Sensitive>{formatBRL(currentVal)}</Sensitive>
                        </span>
                      </div>
                    )}
                    {prevVal !== undefined && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground flex items-center gap-1.5 capitalize">
                          <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden />
                          {prevMonthName}
                        </span>
                        <span className="font-medium text-foreground">
                          <Sensitive>{formatBRL(prevVal)}</Sensitive>
                        </span>
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="previousCents"
              name={`Mês anterior (${prevMonthName})`}
              stroke="#9CA3AF"
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="currentCents"
              name={`Mês atual (${currentMonthName})`}
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
