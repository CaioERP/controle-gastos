'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatBRL } from '@/server/domain/money';
import { formatBRLCompact } from './format';

export type MonthlySeries = { key: string; label: string; color: string };
export type MonthlyPoint = { label: string; values: Record<string, number> };

type MonthlyChartProps = {
  points: MonthlyPoint[];
  series: MonthlySeries[];
  mode?: 'stacked' | 'lines';
  className?: string;
};

type TooltipPayloadItem = { dataKey?: unknown; value?: unknown; color?: string };

/** Evolução mensal: barras empilhadas ou linhas, tooltip com cada série e o total do mês. */
export function MonthlyChart({ points, series, mode = 'stacked', className }: MonthlyChartProps) {
  // Chaves das séries (uuids) viram s0..sN para gerar variáveis CSS válidas.
  const safe = series.map((s, i) => ({ ...s, id: `s${i}` }));
  const config: ChartConfig = Object.fromEntries(safe.map((s) => [s.id, { label: s.label, color: s.color }]));
  const data = points.map((p) => {
    const row: Record<string, string | number> = { label: p.label };
    for (const s of safe) row[s.id] = p.values[s.key] ?? 0;
    return row;
  });

  const tooltip = (
    <ChartTooltip
      cursor={mode === 'stacked' ? { fillOpacity: 0.3 } : true}
      content={({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        const items = (payload as readonly TooltipPayloadItem[]).filter((p) => typeof p.value === 'number');
        const total = items.reduce((s, p) => s + (p.value as number), 0);
        return (
          <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
            <div className="font-medium">{String(label)}</div>
            {[...items].reverse().map((p) => (
              <div key={String(p.dataKey)} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: p.color }} />
                  {config[String(p.dataKey)]?.label}
                </span>
                <span className="font-medium tabular-nums"><span data-sensitive>{formatBRL(p.value as number)}</span></span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t pt-1.5 font-semibold">
              <span>Total</span>
              <span className="tabular-nums"><span data-sensitive>{formatBRL(total)}</span></span>
            </div>
          </div>
        );
      }}
    />
  );

  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
      <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => formatBRLCompact(v)} />
    </>
  );

  return (
    <div className={className}>
      <ChartContainer data-sensitive-axis config={config} className="aspect-auto h-64 w-full sm:h-72">
        {mode === 'stacked' ? (
          <BarChart data={data} accessibilityLayer>
            {axes}
            {tooltip}
            {safe.map((s, i) => (
              <Bar
                key={s.id}
                dataKey={s.id}
                stackId="total"
                isAnimationActive={false}
                fill={`var(--color-${s.id})`}
                radius={i === safe.length - 1 ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        ) : (
          <LineChart data={data} accessibilityLayer>
            {axes}
            {tooltip}
            {safe.map((s) => (
              <Line
                key={s.id}
                dataKey={s.id}
                type="monotone"
                stroke={`var(--color-${s.id})`}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        )}
      </ChartContainer>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label="Legenda">
        {safe.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
