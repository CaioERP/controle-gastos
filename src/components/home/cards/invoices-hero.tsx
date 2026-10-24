import * as React from 'react';
import { Money } from '@/components/format/money';
import { parseISO, format } from 'date-fns';
import type { UpcomingInvoice } from '@/server/queries/dashboard';
import { cn } from '@/lib/utils';

type InvoicesHeroProps = {
  openInvoicesCents: number;
  upcomingInvoices: UpcomingInvoice[];
  className?: string;
};

export function InvoicesHero({ openInvoicesCents, upcomingInvoices, className }: InvoicesHeroProps) {
  const nextInvoice = upcomingInvoices[0];

  let nextDueText: React.ReactNode = null;
  if (nextInvoice) {
    const formattedDue = format(parseISO(nextInvoice.dueDate), 'dd/MM');
    nextDueText = (
      <div className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground mt-1 flex-wrap">
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: nextInvoice.institutionColor }}
          aria-hidden
        />
        <span>{nextInvoice.institutionName}</span>
        <span>·</span>
        <Money cents={nextInvoice.totalCents} className="font-semibold text-foreground" />
        <span>·</span>
        <span>vence {formattedDue}</span>
      </div>
    );
  }

  return (
    <section aria-label="Faturas abertas" className={cn('space-y-1', className)}>
      <div className="text-xs sm:text-sm text-muted-foreground">Faturas abertas</div>
      <div className="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
        <Money cents={openInvoicesCents} />
      </div>
      {nextDueText}
    </section>
  );
}
