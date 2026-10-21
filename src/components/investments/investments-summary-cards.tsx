import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/format/money';
import { formatBRL } from '@/server/domain/money';
import type { InvestmentsOverview } from '@/server/queries/investments';

type InvestmentsSummaryCardsProps = {
  totals: InvestmentsOverview['totals'];
};

export function InvestmentsSummaryCards({ totals }: InvestmentsSummaryCardsProps) {
  const profitPercent = (totals.profitBps / 100).toFixed(2).replace('.', ',');
  const profitBadgeText = `${totals.profitBps >= 0 ? '+' : ''}${profitPercent}%`;

  const twrPercent = (totals.twr12mBps / 100).toFixed(2).replace('.', ',');
  const twrText = `${totals.twr12mBps >= 0 ? '+' : ''}${twrPercent}%`;

  const cdiPercent = (totals.cdi12mBps / 100).toFixed(2).replace('.', ',');
  const cdiText = `${totals.cdi12mBps >= 0 ? '+' : ''}${cdiPercent}%`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Patrimônio investido */}
      <Card size="sm" className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Patrimônio investido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money
            cents={totals.currentValueCents}
            className="block text-xl font-semibold sm:text-2xl"
          />
          <p className="text-xs text-muted-foreground">
            Aplicado: {formatBRL(totals.investedCents)} · Líquido est.:{' '}
            {formatBRL(totals.netValueCents)}
          </p>
        </CardContent>
      </Card>

      {/* 2. Rentabilidade bruta */}
      <Card size="sm" className="min-w-0">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Rentabilidade bruta
          </CardTitle>
          <Badge
            variant={totals.profitBps >= 0 ? 'default' : 'destructive'}
            className="tabular-nums"
          >
            {profitBadgeText}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money
            cents={totals.profitCents}
            signed
            colored
            className="block text-xl font-semibold sm:text-2xl"
          />
          <p className="text-xs text-muted-foreground">Ganho sobre o total aplicado</p>
        </CardContent>
      </Card>

      {/* 3. Desempenho 12 meses (TWR) */}
      <Card size="sm" className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Desempenho 12 meses (TWR)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <span
            className={`block text-xl font-semibold tabular-nums sm:text-2xl ${
              totals.twr12mBps >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {twrText}
          </span>
          <p className="text-xs text-muted-foreground tabular-nums">
            CDI: {cdiText}
            {totals.percentOfCdi12m !== null ? (
              <span> ({totals.percentOfCdi12m.toString().replace('.', ',')}% do CDI)</span>
            ) : null}
          </p>
        </CardContent>
      </Card>

      {/* 4. Proventos (12 meses) */}
      <Card size="sm" className="min-w-0">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Proventos (12 meses)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <Money
            cents={totals.income12mCents}
            className="block text-xl font-semibold sm:text-2xl"
          />
          <p className="text-xs text-muted-foreground">Dividendos, JCP e rendimentos</p>
        </CardContent>
      </Card>
    </div>
  );
}
