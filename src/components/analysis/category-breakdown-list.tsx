'use client';

import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';
import { formatShare } from '@/components/charts/format';
import {
  crossTransactionsHref,
  categoryTransactionsHref,
  isFilterableId,
  type CategoryLinkOptions,
} from '@/components/charts/links';
import { paymentMethodColor } from '@/components/charts/palette';
import { analysisHref, type AnalysisSection } from './links';
import type { TxFilters } from '@/server/domain/filters';
import type { Heatmap, AnalysisDim } from '@/server/queries/analysis';

export type CategoryBreakdownListProps = {
  heatmap: Heatmap;
  filters: TxFilters;
  linkOptions?: CategoryLinkOptions;
  dim?: AnalysisDim;
  secao?: AnalysisSection;
  drilled?: boolean;
};

/**
 * Lista de categorias com barra empilhada por forma de pagamento:
 * - No celular e no desktop: clicar na linha expande o detalhamento das formas.
 * - No desktop, as formas aparecem em grade de 2 colunas.
 * - Clicar no nome da categoria abre subcategorias (ou transações, se já detalhado).
 */
export function CategoryBreakdownList({
  heatmap,
  filters,
  linkOptions = {},
  dim = 'category',
  secao = 'categorias',
  drilled = false,
}: CategoryBreakdownListProps) {
  const { rows, cols, grandTotalCents } = heatmap;
  const colLabel = (key: string) => cols.find((c) => c.key === key)?.label ?? key;
  const usedCols = cols.filter((c) =>
    rows.some((r) => r.cells.some((cell) => cell.colKey === c.key && cell.cents > 0))
  );

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem gastos no período.</p>;
  }

  return (
    <div className="space-y-3" data-testid="crosstab-mobile">
      <ul role="list" aria-label="Gastos por categoria" className="divide-y divide-border/40">
        {rows.map((r) => {
          const positive = r.cells.filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents);
          const barTotal = positive.reduce((s, c) => s + c.cents, 0);

          return (
            <li key={r.key} className="py-1">
              <details className="group rounded-xl transition-colors open:bg-muted/30">
                <summary className="cursor-pointer list-none space-y-1.5 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: r.color ?? '#9CA3AF' }}
                      />
                      {isFilterableId(r.key) && !drilled ? (
                        <Link
                          href={analysisHref(filters, { categoryIds: [r.key] }, dim, secao)}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium text-foreground hover:underline underline-offset-4"
                        >
                          {r.label}
                        </Link>
                      ) : isFilterableId(r.key) && drilled ? (
                        <Link
                          href={categoryTransactionsHref(filters, r.key, linkOptions) ?? '#'}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium text-foreground hover:underline underline-offset-4"
                        >
                          {r.label}
                        </Link>
                      ) : (
                        <span className="truncate font-medium">{r.label}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <strong className="font-semibold text-foreground">
                        <Money cents={r.totalCents} />
                      </strong>
                      <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                        {formatShare(r.totalCents, grandTotalCents)}
                      </span>
                    </span>
                  </div>
                  {barTotal > 0 && (
                    <div className="flex h-2 md:h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                      {positive.map((c) => (
                        <span
                          key={c.colKey}
                          style={{
                            width: `${(c.cents / barTotal) * 100}%`,
                            backgroundColor: paymentMethodColor(c.colKey),
                          }}
                        />
                      ))}
                    </div>
                  )}
                </summary>
                <div className="px-3 pb-3 pt-1">
                  <ul className="space-y-1 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-1 md:space-y-0 text-xs">
                    {positive.map((c) => {
                      const href = crossTransactionsHref(filters, r.key, c.colKey, linkOptions);
                      const content = (
                        <>
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: paymentMethodColor(c.colKey) }}
                            />
                            <span className="truncate text-foreground">{colLabel(c.colKey)}</span>
                          </span>
                          <span className="flex shrink-0 items-baseline gap-2">
                            <Money cents={c.cents} className="font-normal" />
                            <span className="w-10 text-right text-muted-foreground tabular-nums">
                              {formatShare(c.cents, barTotal)}
                            </span>
                          </span>
                        </>
                      );
                      const cls = 'flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors';
                      return (
                        <li key={c.colKey}>
                          {href ? (
                            <Link href={href} className={`${cls} hover:bg-muted/60`}>
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
              </details>
            </li>
          );
        })}
      </ul>

      {usedCols.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1" aria-label="Formas de pagamento">
          {usedCols.map((c) => (
            <li key={c.key} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: paymentMethodColor(c.key) }} />
              {c.label}
            </li>
          ))}
        </ul>
      )}

      <div className="hidden md:block pt-1">
        <a
          href="#crosstab-matrix"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
        >
          Ver a tabela categoria × forma de pagamento
        </a>
      </div>
    </div>
  );
}
