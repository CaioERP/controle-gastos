'use client';

import * as React from 'react';
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Sensitive } from '@/components/format/money';
import { formatBRL } from '@/server/domain/money';
import { formatBRLCompact } from '@/components/charts/format';
import type { BalancePoint } from '@/server/home/cash-accounts';
import { parseISO, format } from 'date-fns';
import { cn } from '@/lib/utils';

export type BalanceChartProps = {
  history: BalancePoint[];
  className?: string;
};

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { date?: string };
}

export function BalanceChart({ history, className }: BalanceChartProps) {
  // Ponto de hoje: último ponto real
  const lastReal = history.filter((p) => !p.projected).slice(-1)[0];
  const todayDate = lastReal?.date ?? '';

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
      // Conectar a linha de previsão ao último ponto real
      if (p.date === todayDate) {
        entry.previsto = p.balanceCents;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [history, todayDate]);

  const values = history.map((p) => p.balanceCents).filter((v) => typeof v === 'number');
  const minCents = values.length ? Math.min(...values) : 0;
  const maxCents = values.length ? Math.max(...values) : 0;

  const sortedDates = chartData.map((d) => d.date);
  const ticks = React.useMemo(() => {
    if (sortedDates.length <= 5) return sortedDates;
    const first = sortedDates[0];
    const last = sortedDates[sortedDates.length - 1];
    const todayIdx = sortedDates.indexOf(todayDate);

    if (todayIdx > 0 && todayIdx < sortedDates.length - 1) {
      const q1 = sortedDates[Math.floor(todayIdx / 2)];
      return [first, q1, todayDate, last].filter((d): d is string => Boolean(d));
    }
    const mid1 = sortedDates[Math.floor(sortedDates.length / 3)];
    const mid2 = sortedDates[Math.floor((sortedDates.length * 2) / 3)];
    return [first, mid1, mid2, last].filter((d): d is string => Boolean(d));
  }, [sortedDates, todayDate]);

  const chartConfig = {
    real: {
      label: 'Saldo',
      color: 'var(--primary)',
    },
    previsto: {
      label: 'Previsão',
      color: 'var(--muted-foreground)',
    },
  } satisfies ChartConfig;

  return (
    <section aria-label="Saldo nos últimos 90 dias" className={cn('pt-6 border-t border-border/50', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm sm:text-base font-semibold text-foreground">
          Saldo nos últimos 90 dias
        </h2>
        <span className="text-xs text-muted-foreground shrink-0">
          mín <Sensitive>{formatBRLCompact(minCents)}</Sensitive> · máx{' '}
          <Sensitive>{formatBRLCompact(maxCents)}</Sensitive>
          <span className="hidden sm:inline">
            {' '}· <span className="border-b-2 border-dashed border-muted-foreground/60">previsão</span>
          </span>
        </span>
      </div>

      <ChartContainer
        config={chartConfig}
        className="h-[120px] sm:h-[190px] w-full mt-3"
        data-sensitive-axis
      >
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
            className="text-muted-foreground"
            tickFormatter={(d: string) => {
              if (d === todayDate) return 'hoje';
              try {
                return format(parseISO(d), 'dd/MM');
              } catch {
                return d;
              }
            }}
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
                  <p className="font-semibold text-foreground">
                    {dateStr === todayDate ? `${formattedDate} (hoje)` : formattedDate}
                  </p>
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
            strokeWidth={2.5}
            dot={(props: DotProps) => {
              const { cx, cy, payload } = props;
              if (payload?.date === todayDate && typeof cx === 'number' && typeof cy === 'number') {
                return (
                  <circle
                    key={`today-dot-${payload.date}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill="var(--primary)"
                  />
                );
              }
              return null;
            }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="previsto"
            name="Previsão"
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ChartContainer>
    </section>
  );
}
