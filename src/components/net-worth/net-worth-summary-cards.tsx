import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Money, Sensitive } from '@/components/format/money';
import { formatBRL } from '@/server/domain/money';
import type { NetWorthOverview } from '@/server/queries/net-worth';

type NetWorthSummaryCardsProps = {
  current: NetWorthOverview['current'];
  changes: NetWorthOverview['changes'];
};

export function NetWorthSummaryCards({ current, changes }: NetWorthSummaryCardsProps) {
  const monthPercent =
    changes.monthDeltaBps !== null
      ? `${changes.monthDeltaBps >= 0 ? '+' : ''}${(changes.monthDeltaBps / 100).toFixed(2).replace('.', ',')}% no mês`
      : null;

  const yearPercent =
    changes.yearDeltaBps !== null
      ? `${changes.yearDeltaBps >= 0 ? '+' : ''}${(changes.yearDeltaBps / 100).toFixed(2).replace('.', ',')}%`
      : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Patrimônio líquido */}
      <Card size="sm" className="min-w-0 border-primary/20 bg-primary/[0.02]">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Patrimônio líquido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money
            cents={current.netWorthCents}
            className="block text-2xl font-bold sm:text-3xl text-foreground"
          />
          <p className="text-xs text-muted-foreground">
            Ativos menos faturas e parcelas futuras
          </p>
        </CardContent>
      </Card>

      {/* 2. Total de ativos */}
      <Card size="sm" className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total de ativos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money cents={current.assetsCents} className="block text-xl font-semibold sm:text-2xl" />
          <p className="text-xs text-muted-foreground">
            Contas: <Sensitive>{formatBRL(current.cashAccountsCents)}</Sensitive> · Investimentos:{' '}
            <Sensitive>{formatBRL(current.investmentsCents)}</Sensitive>
          </p>
        </CardContent>
      </Card>

      {/* 3. Total de compromissos (dívidas) */}
      <Card size="sm" className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total de compromissos (dívidas)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money
            cents={current.liabilitiesCents}
            className="block text-xl font-semibold sm:text-2xl text-amber-600 dark:text-amber-400"
          />
          <p className="text-xs text-muted-foreground">
            Faturas abertas: <Sensitive>{formatBRL(current.openInvoicesCents)}</Sensitive> · Parcelas futuras:{' '}
            <Sensitive>{formatBRL(current.futureInstallmentsCents)}</Sensitive>
          </p>
        </CardContent>
      </Card>

      {/* 4. Variação no mês / no ano */}
      <Card size="sm" className="min-w-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Variação no mês / no ano
          </CardTitle>
          {changes.monthDeltaBps !== null ? (
            <Badge
              variant={changes.monthDeltaBps >= 0 ? 'default' : 'destructive'}
              className="text-[10px] tabular-nums"
            >
              {monthPercent}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-1">
          {changes.monthDeltaCents !== null ? (
            <Money
              cents={changes.monthDeltaCents}
              signed
              colored
              className="block text-xl font-semibold sm:text-2xl"
            />
          ) : (
            <span className="block text-xl font-semibold text-muted-foreground sm:text-2xl">
              —
            </span>
          )}

          <p className="text-xs text-muted-foreground tabular-nums">
            {changes.yearDeltaCents !== null && yearPercent !== null ? (
              <span>
                No ano: <Sensitive>{formatBRL(changes.yearDeltaCents)}</Sensitive> ({yearPercent})
              </span>
            ) : (
              <span>Sem histórico anterior</span>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
