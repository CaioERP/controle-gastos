'use client';

import * as React from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Sensitive } from '@/components/format/money';
import { formatBRL } from '@/server/domain/money';
import { formatBRLCompact } from '@/components/charts/format';
import type { BalancePoint } from '@/server/home/cash-accounts';
import { parseISO, format } from 'date-fns';

export type BalanceChartProps = {
  history: BalancePoint[];
  className?: string;
};

export function BalanceChart({ history, className }: BalanceChartProps) {
  const chartData = React.useMemo(() => {
    const map = new Map<string, { date: string; real: number | null; previsto: number | null }>();

    for (const p of history) {
      if (!map.has(p.date)) {
        map.set(p.date, { date: p.date, real: null, previsto: null });
      }
      const entry = map.get(p.date)!;
      if (!p.projected) {
        entry.real = p.balanceCents;
      } else {
        entry.previsto = p.balanceCents;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [history]);

  const chartConfig = {
    real: {
      label: 'Saldo',
      color: 'var(--primary)',
    },
    previsto: {
      label: 'Previsão (faturas e contas fixas)',
      color: '#9CA3AF',
    },
  } satisfies ChartConfig;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Evolução do saldo (últimos 90 dias e previsão)
        </CardTitle>
        <div className="flex items-center gap-3 text-xs text-muted-foreground hidden sm:flex">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 bg-primary rounded-full inline-block" />
            <span>Saldo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 border-b-2 border-dashed border-muted-foreground inline-block" />
            <span>Previsão (faturas e contas fixas)</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <ChartContainer config={chartConfig} className="h-56 w-full" data-sensitive-axis>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={12}
              className="text-muted-foreground"
              tickFormatter={(d: string) => {
                try {
                  return format(parseISO(d), 'dd/MM');
                } catch {
                  return d;
                }
              }}
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
                const dateStr = typeof label === 'string' ? label : '';
                let formattedDate = dateStr;
                try {
                  formattedDate = format(parseISO(dateStr), 'dd/MM/yyyy');
                } catch {
                  // fallback
                }

                const realVal = payload.find((p) => p.dataKey === 'real')?.value as
                  | number
                  | undefined
                  | null;
                const prevVal = payload.find((p) => p.dataKey === 'previsto')?.value as
                  | number
                  | undefined
                  | null;

                return (
                  <div className="rounded-lg border bg-background p-2.5 shadow-md text-xs space-y-1">
                    <p className="font-semibold text-foreground">{formattedDate}</p>
                    {realVal !== undefined && realVal !== null && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-primary" aria-hidden />
                          Saldo
                        </span>
                        <span className="font-medium text-foreground">
                          <Sensitive>{formatBRL(realVal)}</Sensitive>
                        </span>
                      </div>
                    )}
                    {prevVal !== undefined && prevVal !== null && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden />
                          Previsão
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
              dataKey="real"
              name="Saldo"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="previsto"
              name="Previsão (faturas e contas fixas)"
              stroke="#9CA3AF"
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ChartContainer>

        <div className="flex items-center gap-3 text-xs text-muted-foreground sm:hidden pt-1">
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 bg-primary rounded-full inline-block" />
            <span>Saldo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 border-b-2 border-dashed border-muted-foreground inline-block" />
            <span>Previsão</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
