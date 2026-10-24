import * as React from 'react';
import { Money } from '@/components/format/money';
import type { CashFlowBreakdown } from '@/server/home/cash-accounts';
import { cn } from '@/lib/utils';

export type CashFlowCardProps = {
  flow: CashFlowBreakdown;
  className?: string;
};

export function CashFlowCard({ flow, className }: CashFlowCardProps) {
  const breakdownItems = [
    { label: 'Gastos', amountCents: flow.out.expenseCents, bgClass: 'bg-foreground' },
    { label: 'Pagamento de faturas', amountCents: flow.out.invoicePaymentCents, bgClass: 'bg-muted-foreground' },
    { label: 'Investimentos', amountCents: flow.out.investmentCents, bgClass: 'bg-muted-foreground/50' },
    { label: 'Outros', amountCents: flow.out.otherCents, bgClass: 'bg-muted-foreground/25' },
  ].filter((item) => item.amountCents > 0);

  const totalOutCents = Math.max(flow.outCents, 1);

  return (
    <section
      aria-label="Fluxo das contas"
      className={cn('rounded-2xl bg-muted/40 p-4 sm:p-5', className)}
    >
      <h2 className="text-sm sm:text-base font-semibold text-foreground">Fluxo das contas</h2>

      {/* 3 colunas: Entradas, Saídas, Sobra */}
      <div className="mt-3.5 grid grid-cols-3 gap-2 sm:gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Entradas</div>
          <Money
            cents={flow.inCents}
            signed
            colored
            className="text-base sm:text-xl font-semibold tracking-tight block"
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Saídas</div>
          <Money
            cents={flow.outCents}
            className="text-base sm:text-xl font-semibold tracking-tight text-foreground block"
          />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Sobra</div>
          <Money
            cents={flow.netCents}
            signed
            colored
            className="text-base sm:text-xl font-semibold tracking-tight block"
          />
        </div>
      </div>

      {/* Barra empilhada das saídas em tons neutros */}
      {breakdownItems.length > 0 && (
        <>
          <div className="mt-3.5 h-2 rounded-full bg-muted flex overflow-hidden gap-0.5">
            {breakdownItems.map((item, idx) => {
              const pct = Math.min(100, Math.max(1, (item.amountCents / totalOutCents) * 100));
              return (
                <span
                  key={idx}
                  className={cn('h-full transition-all', item.bgClass)}
                  style={{ width: `${pct}%` }}
                />
              );
            })}
          </div>

          <ul className="mt-3 space-y-1.5 text-xs sm:text-sm">
            {breakdownItems.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className={cn('size-2 rounded-xs', item.bgClass)} aria-hidden />
                  <span>{item.label}</span>
                </span>
                <Money cents={item.amountCents} className="font-medium text-foreground" />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
