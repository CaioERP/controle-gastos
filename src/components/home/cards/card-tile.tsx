import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import { formatDateBR } from '@/server/domain/dates';
import { INVOICE_STATUS_LABELS } from '@/server/domain/labels';
import type { InvoiceStatus } from '@/server/domain/enums';
import { cn } from '@/lib/utils';

export type CardTileAccount = {
  id: string;
  name: string;
  displayName: string | null;
  institution: {
    id: string;
    name: string;
    color: string;
  };
  credit: {
    limitCents: number | null;
    availableCents: number | null;
    closingDay: number | null;
    dueDay: number | null;
    openInvoice: {
      id: string;
      totalCents: number;
      dueDate: string;
      status: InvoiceStatus;
    } | null;
  } | null;
};

const STATUS_CLASS: Record<InvoiceStatus, string> = {
  open: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  closed: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  overdue: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

export function CardTile({ account }: { account: CardTileAccount }) {
  const cardName = account.displayName ?? account.name;
  const openInvoice = account.credit?.openInvoice;

  const hasLimitInfo =
    account.credit?.limitCents !== null &&
    account.credit?.limitCents !== undefined &&
    account.credit.limitCents > 0 &&
    account.credit?.availableCents !== null &&
    account.credit?.availableCents !== undefined;

  let usedCents = 0;
  let percentUsed = 0;
  if (hasLimitInfo) {
    const limit = account.credit!.limitCents!;
    const available = account.credit!.availableCents!;
    usedCents = Math.max(0, limit - available);
    percentUsed = Math.min(100, Math.max(0, Math.round((usedCents / limit) * 100)));
  }

  return (
    <Link
      href={`/faturas?cartao=${account.id}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card className="h-full transition-all group-hover:border-foreground/20 group-hover:shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: account.institution.color }}
                aria-hidden
              />
              <span className="font-semibold text-base truncate">{cardName}</span>
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                ({account.institution.name})
              </span>
            </div>
            {openInvoice ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium shrink-0',
                  STATUS_CLASS[openInvoice.status],
                )}
              >
                {INVOICE_STATUS_LABELS[openInvoice.status]}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <span className="text-xs text-muted-foreground block">Fatura atual</span>
            {openInvoice ? (
              <div className="flex items-baseline gap-2 mt-0.5">
                <Money cents={openInvoice.totalCents} className="text-xl font-bold tracking-tight" />
                <span className="text-xs text-muted-foreground">
                  vence {formatDateBR(openInvoice.dueDate)}
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground mt-0.5 block">Sem fatura aberta</span>
            )}
          </div>

          <div className="pt-1">
            {hasLimitInfo ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Limite usado: <Money cents={usedCents} />
                  </span>
                  <span>{percentUsed}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      percentUsed >= 90
                        ? 'bg-red-500'
                        : percentUsed >= 75
                          ? 'bg-amber-500'
                          : 'bg-primary',
                    )}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  Limite total: <Money cents={account.credit!.limitCents!} />
                </div>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground block">Limite não informado</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
