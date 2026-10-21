import * as React from 'react';
import {
  Wallet,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/format/money';
import { formatMonthBR } from '@/server/domain/dates';
import type { CashFlowProjection } from '@/server/queries/cashflow';

type CashFlowSummaryCardsProps = {
  projection: CashFlowProjection;
};

export function CashFlowSummaryCards({ projection }: CashFlowSummaryCardsProps) {
  const {
    currentBalanceCents,
    horizonMonths,
    points,
    lowestProjectedBalanceCents,
    lowestBalanceMonth,
  } = projection;

  const finalPoint = points[points.length - 1];
  const finalProjectedBalanceCents = finalPoint?.projectedBalanceCents ?? currentBalanceCents;
  const netVariationCents = finalProjectedBalanceCents - currentBalanceCents;
  const isNetPositive = netVariationCents >= 0;
  const isLowestNegative = lowestProjectedBalanceCents < 0;

  const lowestMonthLabel = lowestBalanceMonth
    ? formatMonthBR(`${lowestBalanceMonth}-01`)
    : '—';

  const finalMonthLabel = finalPoint
    ? formatMonthBR(`${finalPoint.month}-01`)
    : `${horizonMonths} meses`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Saldo Líquido Atual */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Saldo Líquido Atual</CardTitle>
          <Wallet className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight">
            <Money cents={currentBalanceCents} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Disponível em contas correntes, carteiras e poupança
          </p>
        </CardContent>
      </Card>

      {/* 2. Saldo Projetado em 6 Meses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Saldo Projetado ({horizonMonths} Meses)
          </CardTitle>
          <TrendingUp className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight">
            <Money cents={finalProjectedBalanceCents} colored />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Previsão para {finalMonthLabel}
          </p>
        </CardContent>
      </Card>

      {/* 3. Menor Saldo Previsto */}
      <Card className={isLowestNegative ? 'border-destructive/40 bg-destructive/5' : undefined}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Menor Saldo Previsto</CardTitle>
          {isLowestNegative ? (
            <AlertTriangle className="size-4 text-destructive" />
          ) : (
            <ArrowDownRight className="size-4 text-muted-foreground" />
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between gap-2">
            <div
              className={
                isLowestNegative
                  ? 'text-2xl font-bold tracking-tight text-destructive'
                  : 'text-2xl font-bold tracking-tight'
              }
            >
              <Money cents={lowestProjectedBalanceCents} />
            </div>
            <Badge
              variant={isLowestNegative ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {lowestMonthLabel}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLowestNegative
              ? 'Risco de déficit identificado'
              : 'Ponto de menor liquidez projetado'}
          </p>
        </CardContent>
      </Card>

      {/* 4. Variação Líquida no Semestre */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Variação no Semestre</CardTitle>
          {isNetPositive ? (
            <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <ArrowDownRight className="size-4 text-red-600 dark:text-red-400" />
          )}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tracking-tight">
            <Money cents={netVariationCents} signed colored />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isNetPositive
              ? 'Superávit líquido acumulado previsto'
              : 'Redução líquida de caixa prevista'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
