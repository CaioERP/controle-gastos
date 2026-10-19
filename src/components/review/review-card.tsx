'use client';

import * as React from 'react';
import { ArrowLeftRightIcon, CheckIcon, CreditCardIcon, ListIcon, SkipForwardIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/format/money';
import { DateBR } from '@/components/format/date-br';
import { CategoryPicker } from '@/components/transactions/category-picker';
import { RecategorizeDialog, type RecategorizeScope } from '@/components/transactions/recategorize-dialog';
import { categoryKindFor, formatConfidence, isAutoSuggestion, type FlatCategory } from '@/components/transactions/tx-utils';
import { cn } from '@/lib/utils';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { CategoryTree } from '@/server/queries/catalog';
import type { TransactionRow } from '@/server/queries/transaction-row';

export function hasSuggestion(tx: TransactionRow): boolean {
  return tx.category !== null && isAutoSuggestion(tx.categorySource) && categoryKindFor(tx.kind) !== null;
}

export type ReviewCardHandlers = {
  onActivate: (tx: TransactionRow) => void;
  onConfirm: (tx: TransactionRow) => void;
  onPick: (tx: TransactionRow, category: FlatCategory, scope: RecategorizeScope) => void;
  onKind: (tx: TransactionRow, kind: 'transfer' | 'invoice_payment') => void;
  onMarkReviewed: (tx: TransactionRow) => void;
  onSkip: (tx: TransactionRow) => void;
  onPickerOpenChange: (tx: TransactionRow, open: boolean) => void;
};

type ReviewCardProps = ReviewCardHandlers & {
  tx: TransactionRow;
  categories: CategoryTree[];
  active: boolean;
  leaving: boolean;
  pickerOpen: boolean;
};

export const ReviewCard = React.forwardRef<HTMLElement, ReviewCardProps>(function ReviewCard(
  { tx, categories, active, leaving, pickerOpen, onActivate, onConfirm, onPick, onKind, onMarkReviewed, onSkip, onPickerOpenChange },
  ref,
) {
  const [pending, setPending] = React.useState<FlatCategory | null>(null);
  const catKind = categoryKindFor(tx.kind);
  const suggestion = hasSuggestion(tx);
  const titleId = `revisao-${tx.id}`;

  const handleSelect = (cat: FlatCategory) => {
    if (tx.merchant) setPending(cat);
    else onPick(tx, cat, 'this');
  };

  return (
    <article
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-current={active ? 'true' : undefined}
      data-review-id={tx.id}
      onFocus={() => !active && onActivate(tx)}
      className={cn(
        'space-y-3 rounded-xl border bg-card p-4 transition-all duration-200 outline-none motion-reduce:transition-none',
        active ? 'border-primary/60 shadow-md ring-3 ring-primary/15' : 'opacity-80',
        leaving && 'pointer-events-none translate-x-6 opacity-0',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3 id={titleId} className="truncate text-base font-semibold">
            {tx.description}
          </h3>
          <p className="break-all font-mono text-xs text-muted-foreground">{tx.descriptionRaw}</p>
        </div>
        <Money cents={tx.amountCents} colored className="shrink-0 text-base" />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <DateBR date={tx.date} />
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full" style={{ backgroundColor: tx.institution.color }} aria-hidden="true" />
          {tx.account.name}
          {tx.card && <span className="tabular-nums">•{tx.card.last4}</span>}
        </span>
        <span aria-hidden="true">·</span>
        <span>{PAYMENT_METHOD_LABELS[tx.paymentMethod]}</span>
        {tx.kind !== 'expense' && <Badge variant="outline">{KIND_LABELS[tx.kind]}</Badge>}
      </div>

      <p className="text-sm">
        {suggestion ? (
          <>
            Sugestão: <strong>{tx.category!.name}</strong>
            {tx.categoryConfidence !== null && (
              <span className="text-muted-foreground"> ({formatConfidence(tx.categoryConfidence)})</span>
            )}
          </>
        ) : tx.category ? (
          <>
            Categoria atual: <strong>{tx.category.name}</strong>
          </>
        ) : catKind ? (
          <span className="text-muted-foreground">Sem sugestão de categoria.</span>
        ) : (
          <span className="text-muted-foreground">Esta natureza não usa categoria.</span>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {suggestion && (
          <Button size="sm" onClick={() => onConfirm(tx)} aria-keyshortcuts={active ? 'Enter' : undefined}>
            <CheckIcon aria-hidden="true" />
            Confirmar
          </Button>
        )}
        {!catKind && (
          <Button size="sm" onClick={() => onMarkReviewed(tx)} aria-keyshortcuts={active ? 'Enter' : undefined}>
            <CheckIcon aria-hidden="true" />
            Marcar como revisada
          </Button>
        )}
        {catKind && (
          <CategoryPicker
            categories={categories}
            kind={catKind}
            value={tx.category?.id ?? null}
            onSelect={handleSelect}
            open={pickerOpen}
            onOpenChange={(open) => onPickerOpenChange(tx, open)}
            trigger={
              <Button size="sm" variant={suggestion ? 'outline' : 'default'} aria-keyshortcuts={active ? 'C' : undefined}>
                <ListIcon aria-hidden="true" />
                Escolher outra
              </Button>
            }
          />
        )}
        {tx.kind !== 'transfer' && (
          <Button size="sm" variant="outline" onClick={() => onKind(tx, 'transfer')} aria-keyshortcuts={active ? 'T' : undefined}>
            <ArrowLeftRightIcon aria-hidden="true" />
            É transferência
          </Button>
        )}
        {tx.kind !== 'invoice_payment' && (
          <Button size="sm" variant="outline" onClick={() => onKind(tx, 'invoice_payment')}>
            <CreditCardIcon aria-hidden="true" />
            É pagamento de fatura
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onSkip(tx)} aria-keyshortcuts={active ? 'S' : undefined}>
          <SkipForwardIcon aria-hidden="true" />
          Pular
        </Button>
      </div>

      {tx.merchant && pending && (
        <RecategorizeDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          merchantName={tx.merchant.name}
          categoryName={pending.name}
          onChoose={(scope) => {
            const cat = pending;
            setPending(null);
            onPick(tx, cat, scope);
          }}
        />
      )}
    </article>
  );
});
