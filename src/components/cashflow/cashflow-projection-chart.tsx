'use client';

import * as React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatBRL } from '@/server/domain/money';
import { formatBRLCompact } from '@/components/charts/format';
import type { CashFlowProjection } from '@/server/queries/cashflow';

type CashFlowProjectionChartProps = {
  projection: CashFlowProjection;
};

const chartConfig: ChartConfig = {
  projectedBalanceCents: {
    label: 'Saldo projetado',
    color: 'var(--primary)',
  },
  uncertaintyBand: {
    label: 'Faixa de incerteza',
    color: '#3b82f6',
  },
};

const MONTH_NAMES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function formatMonthShort(monthIso: string): string {
  const parts = monthIso.split('-');
  const y = parts[0]?.slice(2) ?? '';
  const m = parseInt(parts[1] ?? '1', 10) - 1;
  return `${MONTH_NAMES[m] ?? ''}/${y}`;
}

export function CashFlowProjectionChart({ projection }: CashFlowProjectionChartProps) {
  const { currentBalanceCents, points } = projection;

  // Monta a série partindo do saldo líquido atual (mês 0) até o horizonte projetado
  const chartData = React.useMemo(() => {
    const data: Array<{
      key: string;
      label: string;
      isCurrent: boolean;
      projectedBalanceCents: number;
      lowerBandCents: number;
      upperBandCents: number;
      range: [number, number];
      incomeCents: number;
      fixedCents: number;
      cardCents: number;
      variableCents: number;
    }> = [
      {
        key: 'current',
        label: 'Atual',
        isCurrent: true,
        projectedBalanceCents: currentBalanceCents,
        lowerBandCents: currentBalanceCents,
        upperBandCents: currentBalanceCents,
        range: [currentBalanceCents, currentBalanceCents],
        incomeCents: 0,
        fixedCents: 0,
        cardCents: 0,
        variableCents: 0,
      },
      ...points.map((pt) => ({
        key: pt.month,
        label: formatMonthShort(pt.month),
        isCurrent: false,
        projectedBalanceCents: pt.projectedBalanceCents,
        lowerBandCents: pt.lowerBandCents,
        upperBandCents: pt.upperBandCents,
        range: [pt.lowerBandCents, pt.upperBandCents] as [number, number],
        incomeCents: pt.projectedIncomeCents,
        fixedCents: pt.fixedExpensesCents,
        cardCents: pt.cardInstallmentsCents,
        variableCents: pt.variableExpensesCents,
      })),
    ];
    return data;
  }, [currentBalanceCents, points]);

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Projeção de fluxo de caixa</CardTitle>
          <CardDescription>Sem dados suficientes para projetar o fluxo futuro.</CardDescription>
        </CardHeader>
        <CardContent className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Nenhum ponto de projeção gerado.
        </CardContent>
      </Card>
    );
  }

  // Verifica se o gráfico cruza ou chega perto de zero para ajustar domínio se necessário
  const minVal = Math.min(
    0,
    ...chartData.map((d) => Math.min(d.lowerBandCents, d.projectedBalanceCents)),
  );
  const maxVal = Math.max(
    ...chartData.map((d) => Math.max(d.upperBandCents, d.projectedBalanceCents)),
  );

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">
            Trajetória projetada para os próximos {points.length} meses
          </CardTitle>
          <CardDescription className="text-xs">
            Evolução esperada do saldo líquido com cone estatístico de incerteza (± 1,96σ)
          </CardDescription>
        </div>

        {/* Legenda inline */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <span className="h-0.5 w-3 rounded bg-primary" />
            Saldo esperado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded bg-blue-500/20 border border-blue-500/40" />
            Faixa de incerteza (95%)
          </span>
          <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <span className="h-0.5 w-3 border-b border-dashed border-red-500" />
            Saldo R$ 0
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pt-4">
        <ChartContainer data-sensitive-axis config={chartConfig} className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 12, right: 16, bottom: 4, left: -4 }}
            >
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
                domain={[Math.floor(minVal * 1.05), Math.ceil(maxVal * 1.05)]}
                tickFormatter={(cents: number) => formatBRLCompact(cents)}
              />

              {/* Linha horizontal de equilíbrio R$ 0 */}
              <ReferenceLine
                y={0}
                stroke="#ef4444"
                strokeDasharray="3 3"
                strokeWidth={1.5}
              />

              <ChartTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0]?.payload as (typeof chartData)[number] | undefined;
                  if (!item) return null;

                  return (
                    <div className="min-w-56 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-xs shadow-xl">
                      <div className="mb-2 flex items-center justify-between border-b pb-1 font-semibold">
                        <span>{String(label)}</span>
                        {item.isCurrent && (
                          <span className="text-[10px] text-muted-foreground font-normal">
                            Saldo real atual
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 font-semibold">
                          <span className="flex items-center gap-1.5 text-foreground">
                            <span className="size-2 rounded-full bg-primary" />
                            Saldo esperado
                          </span>
                          <span className="tabular-nums font-bold">
                            <span data-sensitive>{formatBRL(item.projectedBalanceCents)}</span>
                          </span>
                        </div>

                        {!item.isCurrent && (
                          <>
                            <div className="flex items-center justify-between gap-3 text-muted-foreground pt-1 border-t border-border/40">
                              <span className="flex items-center gap-1.5">
                                <span className="size-2 rounded-full bg-blue-500/60" />
                                Faixa de incerteza (95%)
                              </span>
                              <span className="tabular-nums font-mono text-[11px]">
                                <span data-sensitive>{formatBRL(item.lowerBandCents)}</span> a <span data-sensitive>{formatBRL(item.upperBandCents)}</span>
                              </span>
                            </div>

                            <p className="pt-1 text-[10px] leading-tight text-muted-foreground/80">
                              Baseada na oscilação histórica de despesas variáveis com incerteza
                              acumulada (± 1,96σ).
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }}
              />

              {/* Área sombreada suave da faixa de incerteza */}
              <Area
                type="monotone"
                dataKey="range"
                fill="#3b82f6"
                stroke="none"
                fillOpacity={0.16}
                isAnimationActive={false}
                name="Faixa de incerteza"
              />

              {/* Linha central do saldo projetado */}
              <Line
                type="monotone"
                dataKey="projectedBalanceCents"
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--primary)' }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
                name="Saldo projetado"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
