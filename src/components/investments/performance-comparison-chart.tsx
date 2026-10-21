'use client';

import * as React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import type { MonthlyPortfolioSeriesPoint } from '@/server/investments/returns';

type PerformanceComparisonChartProps = {
  series: MonthlyPortfolioSeriesPoint[];
};

const chartConfig: ChartConfig = {
  portfolio: {
    label: 'Carteira',
    // O tema usa cores lab()/oklch: hsl(var(--primary)) é inválido e a linha sumia
    color: 'var(--primary)',
  },
  cdi: {
    label: 'CDI',
    color: '#2563EB',
  },
  ipca: {
    label: 'IPCA',
    color: '#D97706',
  },
  ibov: {
    label: 'Ibovespa',
    color: '#7C3AED',
  },
};

const MONTH_NAMES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function formatMonthLabel(monthIso: string): string {
  const parts = monthIso.split('-');
  const y = parts[0]?.slice(2) ?? '';
  const m = parseInt(parts[1] ?? '1', 10) - 1;
  return `${MONTH_NAMES[m] ?? ''}/${y}`;
}

export function PerformanceComparisonChart({ series }: PerformanceComparisonChartProps) {
  const chartData = series.map((pt) => ({
    month: pt.month,
    label: formatMonthLabel(pt.month),
    portfolio: Number((pt.cumulativePortfolioBps / 100).toFixed(2)),
    cdi: Number((pt.cumulativeCdiBps / 100).toFixed(2)),
    ipca: Number((pt.cumulativeIpcaBps / 100).toFixed(2)),
    ibov: Number((pt.cumulativeIbovBps / 100).toFixed(2)),
  }));

  // A série sempre tem 12 meses; sem snapshots nem índices ela vem zerada e não deve virar linha reta no zero.
  const hasData = series.some(
    (pt) =>
      pt.cumulativePortfolioBps !== 0 ||
      pt.cumulativeCdiBps !== 0 ||
      pt.cumulativeIpcaBps !== 0 ||
      pt.cumulativeIbovBps !== 0,
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-col gap-2 space-y-0 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold">
          Rentabilidade acumulada vs Índices (12 meses)
        </CardTitle>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <span className="h-0.5 w-3 rounded bg-primary" />
            Carteira
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-[#2563EB]" />
            CDI
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-[#D97706]" />
            IPCA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-[#7C3AED]" />
            Ibovespa
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {!hasData ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            Sem dados históricos no período
          </div>
        ) : (
          <div className="w-full">
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')}%`}
                  />
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="min-w-36 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                          <div className="mb-1 font-semibold">{String(label)}</div>
                          <div className="space-y-1">
                            {payload.map((item) => {
                              const labelVal = chartConfig[String(item.dataKey)]?.label;
                              const name = typeof labelVal === 'string' ? labelVal : String(item.dataKey);
                              const val = typeof item.value === 'number' ? item.value : 0;
                              const formatted = `${val >= 0 ? '+' : ''}${val.toFixed(2).replace('.', ',')}%`;
                              return (
                                <div
                                  key={String(item.dataKey)}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <span
                                      className="size-2 rounded-full"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    {name}
                                  </span>
                                  <span className="font-medium tabular-nums">{formatted}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {/* Linha Carteira: mais espessa e sólida */}
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name="Carteira"
                    stroke="var(--color-portfolio)"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {/* Linha CDI: tracejada azul */}
                  <Line
                    type="monotone"
                    dataKey="cdi"
                    name="CDI"
                    stroke="#2563EB"
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                  {/* Linha IPCA: tracejada âmbar */}
                  <Line
                    type="monotone"
                    dataKey="ipca"
                    name="IPCA"
                    stroke="#D97706"
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                  {/* Linha Ibovespa: tracejada roxo */}
                  <Line
                    type="monotone"
                    dataKey="ibov"
                    name="Ibovespa"
                    stroke="#7C3AED"
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
