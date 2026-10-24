'use client';

import * as React from 'react';
import Link from 'next/link';
import { Money } from '@/components/format/money';
import { INVOICE_STATUS_LABELS } from '@/server/domain/labels';
import type { InvoiceSummary } from '@/server/queries/invoices';
import { cn } from '@/lib/utils';
import { formatMonthShort, invoiceParam, isForecastInvoice } from './invoice-summary';

type InvoiceTimelineProps = {
  cardId: string;
  invoices: InvoiceSummary[];
  selectedId: string;
};

const STATUS_CLASS: Record<InvoiceSummary['status'], string> = {
  open: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  closed: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  overdue: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

/** Faixa rolável com as faturas em ordem cronológica; a selecionada fica centralizada ao abrir. */
export function InvoiceTimeline({ cardId, invoices, selectedId }: InvoiceTimelineProps) {
  const selectedRef = React.useRef<HTMLAnchorElement>(null);
  const ordered = React.useMemo(
    () => [...invoices].sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth)),
    [invoices],
  );

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selectedId]);

  return (
    <nav className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" aria-label="Linha do tempo das faturas">
      <ol className="flex w-max gap-2">
        {ordered.map((inv) => {
          const selected = inv.id === selectedId;
          const forecast = isForecastInvoice(inv);
          return (
            <li key={inv.id}>
              <Link
                ref={selected ? selectedRef : undefined}
                href={`/faturas?cartao=${cardId}&fatura=${invoiceParam(inv.referenceMonth)}`}
                scroll={false}
                aria-current={selected ? 'true' : undefined}
                data-testid="invoice-chip"
                data-forecast={forecast ? 'true' : undefined}
                className={cn(
                  'flex w-28 flex-col gap-1 rounded-lg border border-border/60 bg-card px-3 py-2 text-left transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  forecast && 'border-dashed',
                  selected && 'border-foreground ring-1 ring-foreground/20',
                )}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {formatMonthShort(inv.referenceMonth)}
                </span>
                <Money cents={inv.totalCents} className={cn('text-sm', forecast && 'italic')} />
                {forecast ? (
                  <span className="w-fit rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-dashed border-border">
                    prevista
                  </span>
                ) : (
                  <span className={cn('w-fit rounded px-1.5 py-0.5 text-[10px] font-medium', STATUS_CLASS[inv.status])}>
                    {INVOICE_STATUS_LABELS[inv.status]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
