'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cell, Pie, PieChart } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Money, Sensitive } from '@/components/format/money';
import { formatShare } from '@/components/charts/format';
import { formatBRL } from '@/server/domain/money';

export type DonutSlice = {
  key: string;
  label: string;
  color: string;
  totalCents: number;
  href: string | null;
};

type CategoryDonutProps = {
  slices: DonutSlice[];
  /** Gasto total do período (soma de todas as linhas, estornos inclusos). */
  totalCents: number;
};

/**
 * Rosca de gastos por categoria. Só valores positivos viram fatia; a legenda lista todos os itens
 * (inclusive "Outras" negativa) para que a soma da legenda bata com o total do centro.
 */
export function CategoryDonut({ slices, totalCents }: CategoryDonutProps) {
  const router = useRouter();
  const drawn = slices.filter((s) => s.totalCents > 0);
  const config: ChartConfig = Object.fromEntries(slices.map((s) => [s.key, { label: s.label, color: s.color }]));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative w-full max-w-56 shrink-0">
        <ChartContainer config={config} className="aspect-square w-full">
          <PieChart>
            <ChartTooltip
              content={({ active, payload }) => {
                const item = payload?.[0]?.payload as DonutSlice | undefined;
                if (!active || !item) return null;
                return (
                  <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                    <div className="font-medium">{item.label}</div>
                    <div className="tabular-nums">
                      <Sensitive>{formatBRL(item.totalCents)}</Sensitive> · {formatShare(item.totalCents, totalCents)}
                    </div>
                  </div>
                );
              }}
            />
            <Pie
              data={drawn}
              dataKey="totalCents"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={(_, index) => {
                const href = drawn[index]?.href;
                if (href) router.push(href);
              }}
            >
              {drawn.map((s) => (
                <Cell
                  key={s.key}
                  fill={s.color}
                  className={s.href ? 'cursor-pointer' : undefined}
                  data-slice={s.key}
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

      <ul className="w-full min-w-0 space-y-1.5 text-sm" aria-label="Legenda: gastos por categoria">
        {slices.map((s) => {
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <Money cents={s.totalCents} />
                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                  {formatShare(s.totalCents, totalCents)}
                </span>
              </span>
            </>
          );
          const cls = 'flex items-center justify-between gap-3 rounded-md px-1.5 py-1';
          return (
            <li key={s.key}>
              {s.href ? (
                <Link
                  href={s.href}
                  className={`${cls} transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                >
                  {content}
                </Link>
              ) : (
                <div className={cls}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
