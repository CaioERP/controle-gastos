import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { DateBR } from '@/components/format/date-br';
import { Money } from '@/components/format/money';
import { INVOICE_STATUS_LABELS } from '@/server/domain/labels';
import type { UpcomingInvoice } from '@/server/queries/dashboard';

/** Fatura aberta de cada cartão, ordenada por vencimento. */
export function UpcomingInvoices({ invoices }: { invoices: UpcomingInvoice[] }) {
  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma fatura em aberto.</p>;
  }
  return (
    <ul className="space-y-2.5 text-sm">
      {invoices.map((inv) => (
        <li key={inv.invoiceId} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: inv.institutionColor }}
            />
            <span className="min-w-0">
              <span className="block truncate">{inv.accountName}</span>
              <span className="block text-xs text-muted-foreground">
                {inv.institutionName} · vence <DateBR date={inv.dueDate} />
              </span>
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <Money cents={inv.totalCents} />
            <Badge variant={inv.status === 'overdue' ? 'destructive' : 'secondary'}>
              {INVOICE_STATUS_LABELS[inv.status]}
            </Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}
