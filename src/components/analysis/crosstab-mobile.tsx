import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';
import { formatShare } from '@/components/charts/format';
import { crossTransactionsHref, type CategoryLinkOptions } from '@/components/charts/links';
import { paymentMethodColor } from '@/components/charts/palette';
import type { TxFilters } from '@/server/domain/filters';
import type { Heatmap } from '@/server/queries/analysis';

type CrosstabMobileProps = { heatmap: Heatmap; filters: TxFilters; linkOptions?: CategoryLinkOptions };

/**
 * Matriz categoria × forma de pagamento no celular: uma linha por categoria com barra empilhada
 * pelas formas de pagamento; tocar abre o detalhamento (com links para /transacoes).
 */
export function CrosstabMobile({ heatmap, filters, linkOptions = {} }: CrosstabMobileProps) {
  const { rows, cols, grandTotalCents } = heatmap;
  const colLabel = (key: string) => cols.find((c) => c.key === key)?.label ?? key;
  const usedCols = cols.filter((c) => rows.some((r) => r.cells.some((cell) => cell.colKey === c.key && cell.cents > 0)));

  return (
    <div className="space-y-3" data-testid="crosstab-mobile">
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => {
          const positive = r.cells.filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents);
          const barTotal = positive.reduce((s, c) => s + c.cents, 0);
          return (
            <li key={r.key}>
              <details className="group">
                <summary className="cursor-pointer list-none space-y-1.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? '#9CA3AF' }} />
                      <span className="truncate font-medium">{r.label}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <Money cents={r.totalCents} />
                      <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                        {formatShare(r.totalCents, grandTotalCents)}
                      </span>
                    </span>
                  </div>
                  {barTotal > 0 && (
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                      {positive.map((c) => (
                        <span
                          key={c.colKey}
                          style={{ width: `${(c.cents / barTotal) * 100}%`, backgroundColor: paymentMethodColor(c.colKey) }}
                        />
                      ))}
                    </div>
                  )}
                </summary>
                <ul className="space-y-1 px-3 pb-3 text-xs">
                  {positive.map((c) => {
                    const href = crossTransactionsHref(filters, r.key, c.colKey, linkOptions);
                    const content = (
                      <>
                        <span className="flex min-w-0 items-center gap-2">
                          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: paymentMethodColor(c.colKey) }} />
                          <span className="truncate">{colLabel(c.colKey)}</span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <Money cents={c.cents} className="font-normal" />
                          <span className="w-10 text-right text-muted-foreground tabular-nums">{formatShare(c.cents, barTotal)}</span>
                        </span>
                      </>
                    );
                    const cls = 'flex items-center justify-between gap-3 rounded-md px-1.5 py-1';
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
              </details>
            </li>
          );
        })}
      </ul>
      {usedCols.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Formas de pagamento">
          {usedCols.map((c) => (
            <li key={c.key} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: paymentMethodColor(c.key) }} />
              {c.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
