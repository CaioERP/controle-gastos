import * as React from 'react';
import { Money } from '@/components/format/money';
import type { MerchantRankingRow } from '@/server/queries/analysis';

/** Ranking de estabelecimentos: tabela no desktop, lista de cartões no celular. */
export function MerchantRanking({ rows }: { rows: MerchantRankingRow[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum estabelecimento no período.</p>;
  }
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
              <td className="max-w-48 truncate py-1.5 pr-2">{r.label}</td>
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
                <span className="truncate font-medium">{r.label}</span>
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
    </>
  );
}
