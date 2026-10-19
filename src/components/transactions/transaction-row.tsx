'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/format/money';
import { cn } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { CategoryTree } from '@/server/queries/catalog';
import type { TransactionRow as Tx } from '@/server/queries/transaction-row';
import { CategoryCell, type RecategorizeHandler } from './category-cell';
import { isReportable } from './tx-utils';

/** Colunas da "tabela" no desktop; no celular a linha vira um cartão em duas colunas. */
export const ROW_GRID = 'md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_8.5rem]';

type TransactionRowProps = {
  tx: Tx;
  categories: CategoryTree[];
  onOpen: (tx: Tx) => void;
  onRecategorize: RecategorizeHandler;
};

export const TransactionRow = React.memo(function TransactionRow({
  tx,
  categories,
  onOpen,
  onRecategorize,
}: TransactionRowProps) {
  const projected = tx.status === 'projected';
  const reportable = isReportable(tx.kind);
  const merchantDiffers = tx.merchant && tx.merchant.name !== tx.description;

  // Clique em qualquer área "neutra" da linha abre o detalhe; botões internos têm ação própria.
  // Eventos de portais (popover, diálogo) também borbulham pela árvore React: ignore o que não está no DOM da linha.
  const handleClick = (e: React.MouseEvent<HTMLLIElement>) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target) || target.closest('button, a, [role="img"]')) return;
    onOpen(tx);
  };

  return (
    <li
      data-tx-id={tx.id}
      onClick={handleClick}
      className={cn(
        'grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-3 py-3 transition-colors hover:bg-muted/40 md:items-center md:gap-y-0',
        ROW_GRID,
        projected && 'italic opacity-60',
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: tx.institution.color }}
            aria-hidden="true"
          />
          <span className="truncate">{tx.account.name}</span>
          {tx.card && <span className="shrink-0 tabular-nums">•{tx.card.last4}</span>}
        </div>
        <button
          type="button"
          onClick={() => onOpen(tx)}
          className="block max-w-full truncate rounded-sm text-left text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {tx.description}
        </button>
        {(merchantDiffers || tx.installment || tx.status !== 'posted' || tx.tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {merchantDiffers && <span className="truncate">{tx.merchant!.name}</span>}
            {tx.installment && (
              <Badge variant="secondary" className="tabular-nums" aria-label={`Parcela ${tx.installment.number} de ${tx.installment.total}`}>
                {tx.installment.number}/{tx.installment.total}
              </Badge>
            )}
            {tx.status === 'pending' && <Badge variant="outline">Pendente</Badge>}
            {projected && <Badge variant="outline">Prevista</Badge>}
            {tx.tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="text-right md:order-4">
        <Money
          cents={tx.amountCents}
          colored={reportable}
          className={cn('text-sm', !reportable && 'text-muted-foreground')}
        />
      </div>

      <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 md:order-2 md:col-span-1">
        <CategoryCell tx={tx} categories={categories} onRecategorize={onRecategorize} />
        <span className="shrink-0 text-xs text-muted-foreground md:hidden">
          {PAYMENT_METHOD_LABELS[tx.paymentMethod]}
        </span>
      </div>

      <div className="hidden text-xs text-muted-foreground md:order-3 md:block">
        {PAYMENT_METHOD_LABELS[tx.paymentMethod]}
      </div>
    </li>
  );
});
