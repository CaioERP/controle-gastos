import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';
import type { BreakdownItem } from '@/server/queries/breakdown';

/** Os N estabelecimentos com maior gasto no período (sem "Sem estabelecimento"). */
export function topMerchants(items: BreakdownItem[], n = 5): BreakdownItem[] {
  return items.filter((i) => i.key !== 'none' && i.totalCents > 0).slice(0, n);
}

export function TopMerchants({ items }: { items: BreakdownItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum estabelecimento no período.</p>;
  }
  return (
    <ol className="space-y-2 text-sm">
      {items.map((m, i) => (
        <li key={m.key} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="w-4 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <Link
              href={`/estabelecimentos/${m.key}`}
              className="truncate font-medium text-foreground hover:underline"
            >
              {m.label}
            </Link>
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{m.count}×</span>
            <Money cents={m.totalCents} />
          </span>
        </li>
      ))}
    </ol>
  );
}
