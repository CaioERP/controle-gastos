import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import type { CashFlowBreakdown } from '@/server/home/cash-accounts';

export type CashFlowCardProps = {
  flow: CashFlowBreakdown;
  className?: string;
};

export function CashFlowCard({ flow, className }: CashFlowCardProps) {
  const breakdownItems = [
    { label: 'Gastos', amountCents: flow.out.expenseCents },
    { label: 'Pagamento de faturas', amountCents: flow.out.invoicePaymentCents },
    { label: 'Investimentos', amountCents: flow.out.investmentCents },
    { label: 'Outros', amountCents: flow.out.otherCents },
  ].filter((item) => item.amountCents > 0);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Fluxo das contas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Entradas, Saídas e Saldo do mês */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground block">Entradas</span>
            <Money cents={flow.inCents} colored className="text-xl font-bold tracking-tight block" />
          </div>

          <div className="pt-2 sm:pt-0 sm:pl-3 space-y-1">
            <span className="text-xs text-muted-foreground block">Saídas</span>
            <Money cents={flow.outCents} className="text-xl font-bold tracking-tight block text-red-600 dark:text-red-400" />
          </div>

          <div className="pt-2 sm:pt-0 sm:pl-3 space-y-1">
            <span className="text-xs text-muted-foreground block">Saldo do mês</span>
            <Money cents={flow.netCents} colored signed className="text-xl font-bold tracking-tight block" />
          </div>
        </div>

        {/* Quebra das saídas */}
        {breakdownItems.length > 0 && (
          <div className="pt-3 border-t border-border/50 space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Detalhamento das saídas
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {breakdownItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-1.5 rounded-md bg-muted/30">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium text-foreground">
                    <Money cents={item.amountCents} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
