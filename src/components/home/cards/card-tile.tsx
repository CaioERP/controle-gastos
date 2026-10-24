import * as React from 'react';
import Link from 'next/link';
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

  const cycleText =
    account.credit?.closingDay && account.credit?.dueDay
      ? `fecha dia ${account.credit.closingDay} · vence dia ${account.credit.dueDay}`
      : openInvoice
        ? `vence ${formatDateBR(openInvoice.dueDate)}`
        : null;

  return (
    <Link
      href={`/faturas?cartao=${account.id}`}
      className="group block p-3.5 sm:p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors shadow-2xs"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: account.institution.color }}
            aria-hidden
          />
          <span className="font-semibold text-sm truncate">{cardName}</span>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            · {account.institution.name}
          </span>
          {cycleText && (
            <span className="text-xs text-muted-foreground truncate hidden md:inline">
              · {cycleText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {openInvoice ? (
            <>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  STATUS_CLASS[openInvoice.status],
                )}
              >
                {INVOICE_STATUS_LABELS[openInvoice.status]}
              </span>
              <Money
                cents={openInvoice.totalCents}
                className="font-semibold text-sm sm:text-base text-foreground"
              />
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Sem fatura</span>
          )}
        </div>
      </div>

      {/* Barra de limite fina (5px) */}
      {hasLimitInfo && (
        <div className="mt-3 pt-2 border-t border-border/40">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>
              Limite usado: <Money cents={usedCents} />
            </span>
            <span>
              {percentUsed}% de <Money cents={account.credit!.limitCents!} />
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                percentUsed >= 90
                  ? 'bg-red-500'
                  : percentUsed >= 75
                    ? 'bg-amber-500'
                    : 'bg-primary',
              )}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}
