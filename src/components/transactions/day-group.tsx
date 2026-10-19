import * as React from 'react';
import { Money } from '@/components/format/money';
import type { CategoryTree } from '@/server/queries/catalog';
import type { TransactionRow as Tx } from '@/server/queries/transaction-row';
import type { RecategorizeHandler } from './category-cell';
import { TransactionRow } from './transaction-row';
import { formatDayHeader, type DayGroup as DayGroupData } from './tx-utils';

type DayGroupProps = {
  group: DayGroupData;
  /** Lista com mais de um ano: o cabeçalho mostra o ano. */
  showYear?: boolean;
  categories: CategoryTree[];
  onOpen: (tx: Tx) => void;
  onRecategorize: RecategorizeHandler;
};

export function DayGroup({ group, showYear = false, categories, onOpen, onRecategorize }: DayGroupProps) {
  const headingId = `dia-${group.date}`;
  return (
    // content-visibility evita renderizar o layout de dias fora da tela em listas longas
    <section aria-labelledby={headingId} className="[contain-intrinsic-size:auto_480px] [content-visibility:auto]">
      <div className="flex items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs font-medium">
        <h2 id={headingId} className="text-muted-foreground first-letter:uppercase">
          {formatDayHeader(group.date, showYear)}
        </h2>
        <span className="text-muted-foreground">
          Saldo do dia: <Money cents={group.balanceCents} signed colored />
        </span>
      </div>
      <ul className="divide-y">
        {group.items.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} categories={categories} onOpen={onOpen} onRecategorize={onRecategorize} />
        ))}
      </ul>
    </section>
  );
}
