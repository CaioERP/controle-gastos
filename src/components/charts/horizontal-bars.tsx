import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';
import { formatShare } from './format';
import { cn } from '@/lib/utils';

export type HorizontalBarItem = {
  key: string;
  label: string;
  color: string;
  totalCents: number;
  count?: number;
  href?: string | null;
};

type HorizontalBarsProps = {
  items: HorizontalBarItem[];
  /** Total usado no % (normalmente o gasto do período, que já desconta estornos). */
  totalCents: number;
  showCount?: boolean;
  ariaLabel: string;
};

/**
 * Barras horizontais em HTML (cada linha é um link, acessível por teclado e legível em 390 px).
 * Linhas negativas (estorno maior que compras) aparecem com valor negativo e barra vazia.
 */
export function HorizontalBars({ items, totalCents, showCount = false, ariaLabel }: HorizontalBarsProps) {
  const max = Math.max(0, ...items.map((i) => i.totalCents));
  return (
    <ul className="space-y-2.5" aria-label={ariaLabel}>
      {items.map((item) => {
        const width = max > 0 ? Math.max(0, (item.totalCents / max) * 100) : 0;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <Money cents={item.totalCents} />
                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                  {formatShare(item.totalCents, totalCents)}
                </span>
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: item.color }} />
              </div>
              {showCount && item.count !== undefined ? (
                <span className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground tabular-nums">
                  {item.count} {item.count === 1 ? 'transação' : 'transações'}
                </span>
              ) : null}
            </div>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  'block rounded-md p-1 -m-1 transition-colors hover:bg-muted/60',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                {body}
              </Link>
            ) : (
              <div className="p-1 -m-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
