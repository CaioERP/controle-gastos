'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatDateBR } from '@/server/domain/dates';
import type { DailySyncStat } from '@/server/queries/connections';

type SyncDailyChartProps = {
  data: DailySyncStat[];
};

const chartConfig: ChartConfig = {
  createdCount: {
    label: 'Transações novas',
    color: 'hsl(var(--primary))',
  },
};

export function SyncDailyChart({ data }: SyncDailyChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    shortLabel: formatDateBR(d.date).slice(0, 5), // dd/mm
    fullLabel: formatDateBR(d.date),
  }));

  return (
    <div data-testid="sync-daily-chart">
      <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full sm:h-64">
        <BarChart data={formatted} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="shortLabel"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={20}
          />
          <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <ChartTooltip
            cursor={{ fillOpacity: 0.25 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as (typeof formatted)[number] | undefined;
              if (!row) return null;
              return (
                <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <div className="font-medium">{row.fullLabel}</div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Transações novas:</span>
                    <span className="font-semibold tabular-nums">{row.createdCount}</span>
                  </div>
                  {row.errorCount > 0 && (
                    <div className="flex items-center justify-between gap-3 text-destructive">
                      <span>Falhas no dia:</span>
                      <span className="font-semibold tabular-nums">{row.errorCount}</span>
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="createdCount"
            isAnimationActive={false}
            fill="var(--color-createdCount)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
