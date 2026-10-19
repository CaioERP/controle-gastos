import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';
import { crossTransactionsHref, type CategoryLinkOptions } from '@/components/charts/links';
import { formatBRL } from '@/server/domain/money';
import type { TxFilters } from '@/server/domain/filters';
import type { Heatmap } from '@/server/queries/analysis';

const HEAT_COLOR = '#F97316';

/** Fundo da célula: laranja com opacidade proporcional ao valor (até 75%, para manter o texto legível). */
function heatBackground(intensity: number): string | undefined {
  if (intensity <= 0) return undefined;
  return `color-mix(in srgb, ${HEAT_COLOR} ${Math.round(8 + intensity * 67)}%, transparent)`;
}

type CrosstabTableProps = { heatmap: Heatmap; filters: TxFilters; linkOptions?: CategoryLinkOptions };

/** Matriz categoria × forma de pagamento com totais; clique na célula abre /transacoes filtrada. */
export function CrosstabTable({ heatmap, filters, linkOptions = {} }: CrosstabTableProps) {
  const { rows, cols, grandTotalCents } = heatmap;
  return (
    <div className="-mx-4 overflow-x-auto px-4" data-testid="crosstab">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Gastos por categoria (linhas) e forma de pagamento (colunas)</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium text-muted-foreground">
              Categoria
            </th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">
                {c.label}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="sticky left-0 z-10 border-t bg-card px-2 py-1.5 text-left font-normal">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? '#9CA3AF' }} />
                  <span className="max-w-40 truncate">{r.label}</span>
                </span>
              </th>
              {r.cells.map((cell) => {
                const href = cell.cents !== 0 ? crossTransactionsHref(filters, r.key, cell.colKey, linkOptions) : null;
                const colLabel = cols.find((c) => c.key === cell.colKey)?.label ?? cell.colKey;
                const content = cell.cents !== 0 ? <Money cents={cell.cents} className="font-normal" /> : <span className="text-muted-foreground/50">—</span>;
                return (
                  <td
                    key={cell.colKey}
                    className="border-t p-0 text-right tabular-nums"
                    style={{ backgroundColor: heatBackground(cell.intensity) }}
                  >
                    {href ? (
                      <Link
                        href={href}
                        data-cell={`${r.key}|${cell.colKey}`}
                        aria-label={`${r.label} · ${colLabel}: ${formatBRL(cell.cents)}`}
                        className="block px-2 py-1.5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        {content}
                      </Link>
                    ) : (
                      <span className="block px-2 py-1.5">{content}</span>
                    )}
                  </td>
                );
              })}
              <td className="border-t px-2 py-1.5 text-right">
                <Money cents={r.totalCents} className="font-semibold" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="sticky left-0 z-10 border-t-2 bg-card px-2 py-2 text-left font-semibold">
              Total
            </th>
            {cols.map((c) => (
              <td key={c.key} className="border-t-2 px-2 py-2 text-right">
                <Money cents={c.totalCents} className="font-semibold" />
              </td>
            ))}
            <td className="border-t-2 px-2 py-2 text-right">
              <Money cents={grandTotalCents} className="font-bold" data-testid="crosstab-total" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
