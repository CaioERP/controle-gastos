'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatBRL } from '@/server/domain/money';
import { formatBRLCompact } from '@/components/charts/format';
import { Sensitive } from '@/components/format/money';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export type MonthlySpendBarsProps = {
  monthly: Array<{ month: string; totalCents: number }>;
  currentMonth?: string;
  className?: string;
};

export function MonthlySpendBars({ monthly, currentMonth, className }: MonthlySpendBarsProps) {
  const activeMonth = currentMonth ?? monthly[monthly.length - 1]?.month ?? '';

  const chartData = React.useMemo(() => {
    return monthly.map((m) => {
      let label = m.month;
      try {
        const d = parseISO(`${m.month}-01`);
        const mon = format(d, 'MMM', { locale: ptBR }).replace('.', '');
        const yy = format(d, 'yy');
        label = `${mon.charAt(0).toUpperCase() + mon.slice(1)}/${yy}`;
      } catch {
        // fallback
      }
      return {
        month: m.month,
        label,
        totalCents: m.totalCents,
        isCurrent: m.month === activeMonth,
      };
    });
  }, [monthly, activeMonth]);

  const chartConfig = {
    spend: {
      label: 'Gasto',
      color: 'var(--primary)',
    },
  } satisfies ChartConfig;

  return (
    <div className={cn('w-full', className)} data-sensitive-axis>
      <ChartContainer config={chartConfig} className="h-48 sm:h-56 w-full">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
            className="text-muted-foreground"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={formatBRLCompact}
            fontSize={11}
            className="text-muted-foreground"
          />
          <ChartTooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0]?.payload as (typeof chartData)[number] | undefined;
              if (!item) return null;
              return (
                <div className="rounded-lg border bg-background p-2 shadow-md text-xs space-y-1">
                  <p className="font-semibold text-foreground">
                    {item.label} {item.isCurrent ? '(mês atual)' : ''}
                  </p>
                  <p className="font-medium text-foreground">
                    <Sensitive>{formatBRL(item.totalCents)}</Sensitive>
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="totalCents" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.isCurrent ? 'var(--primary)' : 'hsl(var(--primary) / 0.5)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
