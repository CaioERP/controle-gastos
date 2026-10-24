'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Money, Sensitive } from '@/components/format/money';
import { formatBRL } from '@/server/domain/money';
import type { FutureInstallmentMonth } from '@/server/queries/installments';
import { cn } from '@/lib/utils';
import { formatMonthShort } from './invoice-summary';

type Scope = 'card' | 'all';

type FutureInstallmentsChartProps = {
  /** Os dois conjuntos já vêm do servidor, com 12 meses cada (fillInstallmentMonths). */
  card: FutureInstallmentMonth[];
  all: FutureInstallmentMonth[];
  cardName: string;
  /** Cor da instituição do cartão (institutions.color). */
  cardColor: string;
  /** Sem o toggle, o gráfico mostra só `card` (a aba Cartões escolhe o cartão por um seletor próprio). */
  showScopeToggle?: boolean;
  /** Conteúdo extra no cabeçalho, à direita do título. */
  action?: React.ReactNode;
};

const ALL_CARDS_COLOR = '#3B82F6';

export function FutureInstallmentsChart({
  card,
  all,
  cardName,
  cardColor,
  showScopeToggle = true,
  action,
}: FutureInstallmentsChartProps) {
  const [chosenScope, setScope] = React.useState<Scope>('card');
  const scope = showScopeToggle ? chosenScope : 'card';
  const rows = scope === 'card' ? card : all;
  const chartConfig = {
    totalCents: { label: 'Parcelas', color: scope === 'card' ? cardColor : ALL_CARDS_COLOR },
  } satisfies ChartConfig;
  const total = rows.reduce((sum, r) => sum + r.totalCents, 0);
  const data = rows.map((r) => ({ ...r, label: formatMonthShort(r.month) }));

  const options: Array<{ value: Scope; label: string }> = [
    { value: 'card', label: cardName },
    { value: 'all', label: 'Todos os cartões' },
  ];

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Parcelas futuras</CardTitle>
          {action}
          {showScopeToggle && (
          <div role="group" aria-label="Escopo das parcelas" className="inline-flex rounded-lg border bg-muted/50 p-1">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={scope === o.value}
                onClick={() => setScope(o.value)}
                className={cn(
                  'max-w-40 truncate rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                  scope === o.value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          )}
        </div>
        <CardDescription data-testid="committed-text">
          <Money cents={total} className="text-foreground" /> já comprometidos nos próximos 12 meses
          {scope === 'card' ? ` em ${cardName}` : ' em todos os cartões visíveis'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma parcela futura prevista.</p>
        ) : (
          <ChartContainer data-sensitive-axis config={chartConfig} className="aspect-auto h-56 w-full">
            <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v: number) => formatBRL(v).replace(/,\d{2}$/, '')}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span className="tabular-nums font-medium"><Sensitive>{formatBRL(Number(value))}</Sensitive></span>
                    )}
                  />
                }
              />
              <Bar dataKey="totalCents" fill="var(--color-totalCents)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function FutureInstallmentsChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card p-4 sm:p-6 h-64 flex flex-col justify-between',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-7 w-28 rounded-lg" />
      </div>
      <div className="flex items-end justify-between gap-3 h-40 pt-4">
        {[20, 50, 40, 75, 45, 30, 20, 15, 10, 5, 0, 0].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md" style={{ height: `${Math.max(h, 8)}%` }} />
        ))}
      </div>
    </div>
  );
}
