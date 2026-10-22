import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import { parseISO, format } from 'date-fns';
import type { UpcomingInvoice } from '@/server/queries/dashboard';

type InvoicesHeroProps = {
  openInvoicesCents: number;
  upcomingInvoices: UpcomingInvoice[];
};

export function InvoicesHero({ openInvoicesCents, upcomingInvoices }: InvoicesHeroProps) {
  const nextInvoice = upcomingInvoices[0];

  let nextDueText: React.ReactNode = null;
  if (nextInvoice) {
    const formattedDue = format(parseISO(nextInvoice.dueDate), 'dd/MM');
    nextDueText = (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1 flex-wrap">
        <span
          className="size-2 rounded-full shrink-0"
          style={{ backgroundColor: nextInvoice.institutionColor }}
          aria-hidden
        />
        <span>{nextInvoice.institutionName}</span>
        <span>·</span>
        <Money cents={nextInvoice.totalCents} />
        <span>·</span>
        <span>vence {formattedDue}</span>
      </div>
    );
  }

  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
          Faturas abertas
        </span>
        <Money cents={openInvoicesCents} className="text-2xl sm:text-3xl font-bold tracking-tight block" />
        {nextDueText}
      </CardContent>
    </Card>
  );
}
