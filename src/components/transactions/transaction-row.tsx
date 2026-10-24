'use client';

import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';
import { formatTimeBR } from '@/components/format/time-br';
import { cn } from '@/lib/utils';
import { formatDateBR } from '@/server/domain/dates';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { CategoryTree } from '@/server/queries/catalog';
import type { TransactionRow as Tx } from '@/server/queries/transaction-row';
import { CategoryAvatar } from './category-avatar';
import { CategoryCell, type RecategorizeHandler } from './category-cell';
import { isReportable } from './tx-utils';

/** Colunas da "tabela" no desktop; no celular a linha vira um cartão em duas colunas. */
export const ROW_GRID = 'md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_8.5rem]';

type TransactionRowProps = {
  tx: Tx;
  categories: CategoryTree[];
  onOpen: (tx: Tx) => void;
  onRecategorize: RecategorizeHandler;
  /** Fora da lista agrupada por dia (ex.: últimas transações), a linha mostra a data. */
  showDate?: boolean;
};

export const TransactionRow = React.memo(function TransactionRow({
  tx,
  categories,
  onOpen,
  onRecategorize,
  showDate = false,
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
        'flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 md:grid md:py-2 md:gap-x-3',
        ROW_GRID,
        projected && 'italic opacity-60',
      )}
    >
      {/* Coluna 1 (desktop) / Bloco esquerdo (celular): Avatar + Descrição + Metadados */}
      <div className="flex min-w-0 items-center gap-3">
        <CategoryAvatar category={tx.category} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <button
            type="button"
            onClick={() => onOpen(tx)}
            className="block max-w-full truncate rounded-sm text-left text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {tx.description}
          </button>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: tx.institution.color }}
              aria-hidden="true"
            />
            <span className="truncate max-w-[120px]">{tx.account.name}</span>
            {tx.card && <span className="shrink-0 tabular-nums">•{tx.card.last4}</span>}
            {(showDate || tx.occurredAt) && (
              <span className="shrink-0 tabular-nums">
                · {[showDate ? formatDateBR(tx.date).slice(0, 5) : null, tx.occurredAt ? formatTimeBR(tx.occurredAt) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <span className="shrink-0 md:hidden">
              · {PAYMENT_METHOD_LABELS[tx.paymentMethod]}
            </span>
            {!reportable && (
              <span className="shrink-0">
                · {KIND_LABELS[tx.kind]} (fora dos gastos)
              </span>
            )}
            {tx.status === 'pending' && (
              <span className="shrink-0 text-amber-600 dark:text-amber-400">· pendente</span>
            )}
            {projected && (
              <span className="shrink-0 text-amber-600 dark:text-amber-400">· prevista</span>
            )}
            {merchantDiffers && (
              <span className="shrink-0 max-w-[100px] truncate">
                ·{' '}
                <Link
                  href={`/estabelecimentos/${tx.merchant!.id}`}
                  className="hover:underline focus-visible:underline"
                >
                  {tx.merchant!.name}
                </Link>
              </span>
            )}
            {tx.installment && (
              <span className="shrink-0 tabular-nums" aria-label={`Parcela ${tx.installment.number} de ${tx.installment.total}`}>
                · {tx.installment.number}/{tx.installment.total}
              </span>
            )}
            {tx.tags.map((t) => (
              <span key={t.id} className="inline-flex shrink-0 items-center gap-1">
                · <span className="size-1.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Coluna 2 (desktop apenas): CategoryCell */}
      <div className="hidden md:flex min-w-0 items-center">
        <CategoryCell tx={tx} categories={categories} onRecategorize={onRecategorize} />
      </div>

      {/* Coluna 3 (desktop apenas): Forma de pagamento */}
      <div className="hidden md:block truncate text-xs text-muted-foreground">
        {PAYMENT_METHOD_LABELS[tx.paymentMethod]}
      </div>

      {/* Coluna 4 (desktop): Valor */}
      <div className="hidden md:block text-right">
        <Money
          sensitive={false}
          cents={tx.amountCents}
          colored={reportable}
          tone="flow"
          className={cn('text-sm', !reportable && 'text-muted-foreground')}
        />
      </div>

      {/* Bloco direito no celular (md:hidden): Valor + CategoryCell quando sem categoria */}
      <div className="flex shrink-0 flex-col items-end justify-center gap-1 text-right md:hidden">
        <Money
          sensitive={false}
          cents={tx.amountCents}
          colored={reportable}
          tone="flow"
          className={cn('text-sm font-medium', !reportable && 'text-muted-foreground')}
        />
        {!tx.category && reportable && (
          <CategoryCell tx={tx} categories={categories} onRecategorize={onRecategorize} />
        )}
      </div>
    </li>
  );
});
