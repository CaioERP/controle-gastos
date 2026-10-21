'use client';

import * as React from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatBRL } from '@/server/domain/money';
import { formatBRLCompact } from '@/components/charts/format';
import type { NetWorthMonthlyPoint } from '@/server/queries/net-worth';
import { Sensitive } from '@/components/format/money';

type NetWorthEvolutionChartProps = {
  series: NetWorthMonthlyPoint[];
};

const chartConfig: ChartConfig = {
  cashAccountsCents: {
    label: 'Saldo em contas',
    color: '#0D9488', // teal
  },
  investmentsCents: {
    label: 'Investimentos',
    color: '#4F46E5', // indigo
  },
  liabilitiesCents: {
    label: 'Faturas e parcelas futuras',
    color: '#F59E0B', // amber
  },
  netWorthCents: {
    label: 'Patrimônio líquido',
    // O tema usa cores lab()/oklch: hsl(var(--primary)) é inválido e a linha sumia
    color: 'var(--primary)',
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

export function NetWorthEvolutionChart({ series }: NetWorthEvolutionChartProps) {
  const chartData = series.map((pt) => ({
    month: pt.month,
    label: formatMonthLabel(pt.month),
    cashAccountsCents: pt.cashAccountsCents,
    investmentsCents: pt.investmentsCents,
    liabilitiesCents: pt.liabilitiesCents,
    netWorthCents: pt.netWorthCents,
  }));

  const hasData = chartData.some((pt) => pt.netWorthCents !== 0 || pt.cashAccountsCents !== 0);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold">Evolução do patrimônio</CardTitle>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <span className="h-0.5 w-3 rounded bg-primary" />
            Patrimônio líquido
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#0D9488]" />
            Saldo em contas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#4F46E5]" />
            Investimentos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#F59E0B]" />
            Dívidas e faturas
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {!hasData ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Sem dados históricos de patrimônio
          </div>
        ) : (
          <div className="w-full">
            <ChartContainer data-sensitive-axis config={chartConfig} className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -4 }}>
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
                    tickFormatter={(cents) => formatBRLCompact(cents)}
                  />
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0]?.payload as (typeof chartData)[number] | undefined;
                      if (!item) return null;

                      return (
                        <div className="min-w-44 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                          <div className="mb-1.5 font-semibold">{String(label)}</div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-3 font-semibold border-b pb-1">
                              <span className="flex items-center gap-1.5 text-foreground">
                                <span className="size-2 rounded-full bg-primary" />
                                Patrimônio líquido
                              </span>
                              <span className="tabular-nums font-bold">
                                <Sensitive>{formatBRL(item.netWorthCents)}</Sensitive>
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-3 text-muted-foreground pt-0.5">
                              <span className="flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-[#0D9488]" />
                                Contas
                              </span>
                              <span className="tabular-nums">
                                <Sensitive>{formatBRL(item.cashAccountsCents)}</Sensitive>
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-3 text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-[#4F46E5]" />
                                Investimentos
                              </span>
                              <span className="tabular-nums">
                                <Sensitive>{formatBRL(item.investmentsCents)}</Sensitive>
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-3 text-amber-600 dark:text-amber-400">
                              <span className="flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-[#F59E0B]" />
                                Dívidas / faturas
                              </span>
                              <span className="tabular-nums">
                                <Sensitive>{formatBRL(item.liabilitiesCents)}</Sensitive>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  {/* Área empilhada de ativos: Contas + Investimentos */}
                  <Area
                    type="monotone"
                    dataKey="cashAccountsCents"
                    name="Saldo em contas"
                    stackId="assets"
                    fill="#0D9488"
                    stroke="#0D9488"
                    fillOpacity={0.25}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="investmentsCents"
                    name="Investimentos"
                    stackId="assets"
                    fill="#4F46E5"
                    stroke="#4F46E5"
                    fillOpacity={0.25}
                    isAnimationActive={false}
                  />

                  {/* Barra de compromissos/dívidas */}
                  <Bar
                    dataKey="liabilitiesCents"
                    name="Dívidas e faturas"
                    fill="#F59E0B"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={28}
                    isAnimationActive={false}
                  />

                  {/* Linha destacada de patrimônio líquido */}
                  <Line
                    type="monotone"
                    dataKey="netWorthCents"
                    name="Patrimônio líquido"
                    stroke="var(--color-netWorthCents)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: 'var(--color-netWorthCents)' }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
