'use client';

import * as React from 'react';
import { Info } from 'lucide-react';
import { parseISO, format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Money } from '@/components/format/money';
import type { FreeToSpend } from '@/server/home/free-to-spend';
import type { CashInstitution } from '@/server/home/cash-accounts';
import { cn } from '@/lib/utils';

export type BalanceHeroProps = {
  freeToSpend: FreeToSpend;
  institutions: CashInstitution[];
  className?: string;
};

export function BalanceHero({ freeToSpend, institutions, className }: BalanceHeroProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const untilFormatted = format(parseISO(freeToSpend.untilDate), 'dd/MM');
  const isNegative = freeToSpend.freeCents < 0;

  const commitments = Math.max(0, freeToSpend.invoicesCents + freeToSpend.fixedExpensesCents);
  const balance = Math.max(0, freeToSpend.balanceCents);
  const denominator = Math.max(balance, commitments, 1);
  const freePartCents = Math.max(0, balance - commitments);
  const freePct = Math.min(100, Math.round((freePartCents / denominator) * 1000) / 10);
  const commitPct = Math.min(100 - freePct, Math.round((commitments / denominator) * 1000) / 10);

  return (
    <section aria-label="Livre para gastar" className={cn('space-y-1', className)}>
      <div className="text-xs sm:text-sm text-muted-foreground">
        Livre para gastar até {untilFormatted}
      </div>

      <div className="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
        {isNegative ? (
          <span className="text-red-600 dark:text-red-400">
            Faltam <Money cents={Math.abs(freeToSpend.freeCents)} />
          </span>
        ) : (
          <Money cents={freeToSpend.freeCents} />
        )}
      </div>

      {/* Barra de 8-10px com saldo livre (bg-primary) e compromissos (bg-amber-500) */}
      <div className="pt-2">
        <div className="h-2 sm:h-2.5 rounded-full bg-muted flex overflow-hidden w-full">
          {freePct > 0 && (
            <span
              className="bg-primary transition-all duration-300"
              style={{ width: `${freePct}%` }}
            />
          )}
          {commitPct > 0 && (
            <span
              className="bg-amber-500 transition-all duration-300"
              style={{ width: `${commitPct}%` }}
            />
          )}
        </div>
      </div>

      {/* Linha com saldo em contas, compromissos e Popover Ver a conta */}
      <div className="pt-1.5 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground">
        <span>
          <span className="hidden sm:inline">Saldo em contas </span>
          <span className="sm:hidden">Saldo </span>
          <strong className="text-foreground font-semibold">
            <Money cents={freeToSpend.balanceCents} />
          </strong>
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span>
          <span className="hidden sm:inline">Faturas e contas fixas até {untilFormatted} </span>
          <span className="sm:hidden">Compromissos </span>
          <strong className="text-amber-700 dark:text-amber-400 font-semibold">
            −<Money cents={commitments} />
          </strong>
        </span>
        <span className="text-muted-foreground/60">·</span>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground inline-flex items-center gap-1 cursor-pointer font-medium"
              >
                <span>Ver a conta</span>
                <Info className="size-3" aria-hidden />
              </button>
            }
          />
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
                        className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-muted-foreground">{format(parseISO(ev.date), 'dd/MM')}</span>
                          <span className="truncate text-foreground font-medium">{ev.label}</span>
                        </div>
                        <span
                          className={cn(
                            'font-medium shrink-0 ml-2',
                            isIncome
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400',
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
      </div>

      {/* Chips por instituição com saldo */}
      {institutions.length > 0 && (
        <div
          className="pt-2 flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1"
          aria-label="Saldos por instituição"
        >
          {institutions.map((inst) => (
            <div
              key={inst.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-xs shrink-0 font-medium"
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: inst.color }}
                aria-hidden
              />
              <span className="text-foreground">{inst.name}</span>
              <strong className="text-foreground font-semibold">
                <Money cents={inst.balanceCents} />
              </strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
