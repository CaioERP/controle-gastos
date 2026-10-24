import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';

export type TransactionsSummaryProps = {
  expenseCents: number;
  incomeCents: number;
  totalCount: number;
  reviewCount: number;
};

export function TransactionsSummary({
  expenseCents,
  incomeCents,
  totalCount,
  reviewCount,
}: TransactionsSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>
        Saídas <Money cents={expenseCents} className="font-semibold text-foreground" />
      </span>
      <span>·</span>
      <span>
        Entradas <Money cents={incomeCents} colored tone="flow" className="font-semibold" />
      </span>
      <span>·</span>
      <span>
        {totalCount} {totalCount === 1 ? 'lançamento' : 'lançamentos'}
      </span>
      <span>·</span>
      {reviewCount > 0 ? (
        <Link href="/revisao" className="text-primary hover:underline font-medium">
          {reviewCount} sem categoria
        </Link>
      ) : (
        <span>0 sem categoria</span>
      )}
    </div>
  );
}
