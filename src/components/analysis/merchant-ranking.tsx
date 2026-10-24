'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/format/money';
import type { MerchantRankingRow } from '@/server/queries/analysis';

const INITIAL_ROWS = 5;

/** Ranking de estabelecimentos: tabela no desktop, lista de cartões no celular. Começa com 5. */
export function MerchantRanking({ rows: allRows }: { rows: MerchantRankingRow[] }) {
  const [expanded, setExpanded] = React.useState(false);
  if (allRows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum estabelecimento no período.</p>;
  }
  const rows = expanded ? allRows : allRows.slice(0, INITIAL_ROWS);
  const hidden = allRows.length - INITIAL_ROWS;
  return (
    <>
      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-2 text-left font-medium">#</th>
            <th scope="col" className="py-1.5 pr-2 text-left font-medium">Estabelecimento</th>
            <th scope="col" className="py-1.5 px-2 text-right font-medium">Total</th>
            <th scope="col" className="py-1.5 px-2 text-right font-medium">Compras</th>
            <th scope="col" className="py-1.5 pl-2 text-right font-medium">Ticket médio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className="border-t">
              <td className="py-1.5 pr-2 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="max-w-48 truncate py-1.5 pr-2">
                <Link href={`/estabelecimentos/${r.key}`} className="hover:underline font-medium text-foreground">
                  {r.label}
                </Link>
              </td>
              <td className="py-1.5 px-2 text-right"><Money cents={r.totalCents} /></td>
              <td className="py-1.5 px-2 text-right tabular-nums">{r.count}</td>
              <td className="py-1.5 pl-2 text-right"><Money cents={r.averageCents} className="font-normal" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="space-y-2 sm:hidden">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-lg border p-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <Link href={`/estabelecimentos/${r.key}`} className="truncate font-medium text-foreground hover:underline">
                  {r.label}
                </Link>
              </span>
              <Money cents={r.totalCents} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">{r.count} {r.count === 1 ? 'compra' : 'compras'}</span>
              <span>ticket médio <Money cents={r.averageCents} className="font-normal" /></span>
            </div>
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Mostrar menos' : `Mostrar mais (${hidden})`}
        </Button>
      )}
    </>
  );
}
