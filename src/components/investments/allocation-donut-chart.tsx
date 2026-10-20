'use client';

import * as React from 'react';
import { Cell, Pie, PieChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Money } from '@/components/format/money';
import { formatBRL } from '@/server/domain/money';
import type { AllocationSlice } from '@/server/queries/investments';

type AllocationDonutChartProps = {
  allocation: AllocationSlice[];
  totalCents: number;
};

export function AllocationDonutChart({ allocation, totalCents }: AllocationDonutChartProps) {
  const drawn = allocation.filter((s) => s.totalCents > 0);
  const chartConfig: ChartConfig = Object.fromEntries(
    allocation.map((s) => [s.assetClass, { label: s.label, color: s.color }]),
  );

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Alocação por classe</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {drawn.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            Nenhum investimento cadastrado
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            {/* Gráfico de rosca */}
            <div className="relative w-full max-w-56 shrink-0">
              <ChartContainer config={chartConfig} className="aspect-square w-full">
                <PieChart>
                  <ChartTooltip
                    content={({ active, payload }) => {
                      const item = payload?.[0]?.payload as AllocationSlice | undefined;
                      if (!active || !item) return null;
                      const share = (item.shareBps / 100).toFixed(1).replace('.', ',');
                      return (
                        <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                          <div className="font-medium">{item.label}</div>
                          <div className="tabular-nums">
                            {formatBRL(item.totalCents)} · {share}%
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Pie
                    data={drawn}
                    dataKey="totalCents"
                    nameKey="label"
                    innerRadius="60%"
                    outerRadius="90%"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {drawn.map((s) => (
                      <Cell
                        key={s.assetClass}
                        fill={s.color}
                        aria-label={`${s.label}: ${formatBRL(s.totalCents)}`}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xs text-muted-foreground">Total</span>
                <Money cents={totalCents} className="text-sm font-semibold" />
              </div>
            </div>

            {/* Legenda lateral */}
            <ul
              className="w-full min-w-0 space-y-2 text-sm"
              aria-label="Legenda: alocação por classe de ativos"
            >
              {drawn.map((s) => {
                const shareText = `${(s.shareBps / 100).toFixed(1).replace('.', ',')}%`;
                return (
                  <li key={s.assetClass} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <Money cents={s.totalCents} />
                      <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                        {shareText}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
