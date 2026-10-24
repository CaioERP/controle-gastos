'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cell, Pie, PieChart } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Money, Sensitive } from '@/components/format/money';
import { formatShare } from '@/components/charts/format';
import { formatBRL } from '@/server/domain/money';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SectionCard, SectionEmpty } from '@/components/charts/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { BreakdownToggle, type BreakdownDimension } from '@/components/charts/breakdown-toggle';
import { toDonutSlices, type DonutSlice } from '@/components/charts/donut-slices';
import { cn } from '@/lib/utils';
import type { BreakdownItem } from '@/server/queries/breakdown';
import type { TxFilters } from '@/server/domain/filters';
import type { CategoryLinkOptions } from '@/components/charts/links';

export type { DonutSlice };

export type BreakdownDonutProps = {
  title: string;
  description?: React.ReactNode;
  mode: BreakdownDimension;
  byCategory: BreakdownItem[];
  byPaymentMethod: BreakdownItem[];
  filters: TxFilters;
  linkOptions?: CategoryLinkOptions;
  totalCents: number;
  className?: string;
};

type DonutViewProps = {
  slices: DonutSlice[];
  totalCents: number;
  ariaLabel: string;
  variant: 'desktop' | 'mobile';
};

function DonutView({ slices, totalCents, ariaLabel, variant }: DonutViewProps) {
  const router = useRouter();
  const drawn = slices.filter((s) => s.totalCents > 0);
  const config: ChartConfig = Object.fromEntries(slices.map((s) => [s.key, { label: s.label, color: s.color }]));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="relative w-full max-w-56 shrink-0">
        <ChartContainer config={config} className="aspect-square w-full" data-sensitive-axis>
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
                    {item.isOthers && item.grouped && item.grouped.length > 0 && (
                      <div className="mt-2 border-t border-border/50 pt-1.5 space-y-1">
                        <div className="text-[11px] font-semibold text-muted-foreground">Itens em Outras:</div>
                        <div className="max-h-36 overflow-y-auto space-y-0.5">
                          {item.grouped.map((g) => (
                            <div
                              key={g.key}
                              className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
                            >
                              <span className="truncate">{g.label}</span>
                              <span className="tabular-nums font-mono">
                                <Sensitive>{formatBRL(g.totalCents)}</Sensitive>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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

      <ul className="w-full min-w-0 space-y-1.5 text-sm" aria-label={ariaLabel}>
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

          if (s.isOthers && s.grouped && s.grouped.length > 0) {
            if (variant === 'desktop') {
              return (
                <li key={s.key}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <div
                          tabIndex={0}
                          role="button"
                          aria-label="Ver itens agrupados em Outras"
                          className={cn(
                            cls,
                            'cursor-help transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                          )}
                        >
                          {content}
                        </div>
                      }
                    />
                    <TooltipContent side="right" className="max-w-xs space-y-1 p-2 text-xs">
                      <div className="font-semibold mb-1">Itens em Outras:</div>
                      <ul className="space-y-1 max-h-48 overflow-y-auto">
                        {s.grouped.map((g) => (
                          <li key={g.key} className="flex items-center justify-between gap-3">
                            <span className="truncate">{g.label}</span>
                            <span className="tabular-nums font-mono">
                              <Sensitive>{formatBRL(g.totalCents)}</Sensitive>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            }

            // Mobile: toque na linha expande lista de agrupados
            return (
              <li key={s.key}>
                <details className="group rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    {content}
                  </summary>
                  <div className="mt-2 border-t border-border/50 pt-1.5 pl-4 pr-1 space-y-1 text-xs text-muted-foreground">
                    {s.grouped.map((g) => (
                      <div key={g.key} className="flex items-center justify-between gap-2 py-0.5">
                        <span className="truncate">{g.label}</span>
                        <span className="shrink-0 tabular-nums">
                          <Money cents={g.totalCents} />
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </li>
            );
          }

          return (
            <li key={s.key}>
              {s.href ? (
                <Link
                  href={s.href}
                  className={cn(
                    cls,
                    'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
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

/**
 * Rosca de gastos com toggle Categoria | Forma de pagamento e detalhe de "Outras".
 * Recebe os itens brutos de categoria e forma de pagamento e gera as fatias
 * para desktop (7 itens) e mobile (5 itens) internamente via `toDonutSlices`.
 */
export function BreakdownDonut({
  title,
  description,
  mode: initialMode = 'categoria',
  byCategory,
  byPaymentMethod,
  filters,
  linkOptions,
  totalCents,
  className,
}: BreakdownDonutProps) {
  const [selectedMode, setSelectedMode] = React.useState<BreakdownDimension | null>(null);
  const [prevInitialMode, setPrevInitialMode] = React.useState(initialMode);

  if (initialMode !== prevInitialMode) {
    setPrevInitialMode(initialMode);
    setSelectedMode(null);
  }

  const currentMode = selectedMode ?? initialMode;

  const desktopCategory = React.useMemo(
    () => toDonutSlices({ items: byCategory, dimension: 'categoria', filters, linkOptions, limit: 7 }),
    [byCategory, filters, linkOptions]
  );
  const mobileCategory = React.useMemo(
    () => toDonutSlices({ items: byCategory, dimension: 'categoria', filters, linkOptions, limit: 5 }),
    [byCategory, filters, linkOptions]
  );
  const desktopPm = React.useMemo(
    () => toDonutSlices({ items: byPaymentMethod, dimension: 'forma', filters, linkOptions, limit: 7 }),
    [byPaymentMethod, filters, linkOptions]
  );
  const mobilePm = React.useMemo(
    () => toDonutSlices({ items: byPaymentMethod, dimension: 'forma', filters, linkOptions, limit: 5 }),
    [byPaymentMethod, filters, linkOptions]
  );

  const desktopSlices = currentMode === 'forma' ? desktopPm : desktopCategory;
  const mobileSlices = currentMode === 'forma' ? mobilePm : mobileCategory;
  const activeLabel = currentMode === 'forma' ? 'gastos por forma de pagamento' : 'gastos por categoria';

  return (
    <SectionCard
      title={title}
      description={description}
      action={<BreakdownToggle param="rosca" value={currentMode} onChange={setSelectedMode} />}
      className={className}
    >
      {desktopSlices.length === 0 ? (
        <SectionEmpty />
      ) : (
        <>
          <div className="hidden md:block">
            <DonutView
              slices={desktopSlices}
              totalCents={totalCents}
              ariaLabel={`Legenda: ${activeLabel}`}
              variant="desktop"
            />
          </div>
          <div className="md:hidden">
            <DonutView
              slices={mobileSlices}
              totalCents={totalCents}
              ariaLabel={`Legenda: ${activeLabel} (celular)`}
              variant="mobile"
            />
          </div>
        </>
      )}
    </SectionCard>
  );
}

export function BreakdownDonutSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card p-6 h-[340px] flex flex-col justify-between',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-7 w-28 rounded-lg" />
      </div>
      <div className="flex items-center justify-center py-4">
        <Skeleton className="size-44 rounded-full" />
      </div>
      <div className="flex items-center justify-center gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
