import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, ListChecks } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** Chamada para a fila de revisão; só aparece quando há transações pendentes. */
export function ReviewCallout({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Card size="sm" className="justify-center">
      <CardContent>
        <Link
          href="/revisao"
          className="group flex items-center justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <ListChecks className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-base font-semibold tabular-nums">
                {count} {count === 1 ? 'transação' : 'transações'} para revisar
              </span>
              <span className="block text-xs text-muted-foreground">Confirme categorias com baixa confiança</span>
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
