'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Money } from '@/components/format/money';
import type { FreeToSpend } from '@/server/home/free-to-spend';
import { cn } from '@/lib/utils';

export type FreeToSpendProps = {
  freeToSpend: FreeToSpend;
  className?: string;
};

export function FreeToSpendWidget({ freeToSpend, className }: FreeToSpendProps) {
  const untilFormatted = format(parseISO(freeToSpend.untilDate), 'dd/MM');
  const isNegative = freeToSpend.freeCents < 0;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'group inline-flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5 text-sm hover:bg-muted/40 transition-colors w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-xs',
          className,
        )}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-muted-foreground text-xs sm:text-sm">
            Livre para gastar até {untilFormatted}:
          </span>
          {isNegative ? (
            <span className="text-red-600 dark:text-red-400 font-bold text-sm sm:text-base">
              faltam <Money cents={Math.abs(freeToSpend.freeCents)} />
            </span>
          ) : (
            <Money
              cents={freeToSpend.freeCents}
              className="font-bold text-foreground text-sm sm:text-base"
            />
          )}
        </div>
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1 shrink-0 group-hover:text-foreground">
          <span>Ver conta</span>
          <Info className="size-3.5" aria-hidden />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 sm:w-96 p-4 space-y-4">
        <div>
          <h4 className="font-semibold text-sm text-foreground">Como calculamos seu saldo livre</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Previsão de caixa até {untilFormatted} considerando saldo atual e compromissos.
          </p>
        </div>

        <div className="space-y-2 text-xs border-y border-border/50 py-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Saldo atual em contas</span>
            <span className="font-medium text-foreground">
              +<Money cents={freeToSpend.balanceCents} />
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Faturas de cartão a vencer</span>
            <span className="font-medium text-red-600 dark:text-red-400">
              -<Money cents={freeToSpend.invoicesCents} />
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Contas fixas previstas</span>
            <span className="font-medium text-red-600 dark:text-red-400">
              -<Money cents={freeToSpend.fixedExpensesCents} />
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Receitas previstas</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              +<Money cents={freeToSpend.incomeCents} />
            </span>
          </div>
          <div className="flex items-center justify-between font-bold pt-2 border-t border-border/40 text-sm">
            <span>Livre para gastar</span>
            <Money
              cents={freeToSpend.freeCents}
              colored
              className={isNegative ? 'text-red-600 dark:text-red-400' : 'text-foreground'}
            />
          </div>
        </div>

        {freeToSpend.events.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Eventos previstos ({freeToSpend.events.length})
            </span>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {freeToSpend.events.map((ev, idx) => {
                const isIncome = ev.kind === 'income';
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-none"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        {format(parseISO(ev.date), 'dd/MM')}
                      </span>
                      <span className="truncate text-foreground font-medium">{ev.label}</span>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 font-medium tabular-nums',
                        isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                      )}
                    >
                      {isIncome ? '+' : '-'}
                      <Money cents={ev.amountCents} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
