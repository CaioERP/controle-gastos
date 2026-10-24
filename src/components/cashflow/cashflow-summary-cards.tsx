import * as React from 'react';
import { StatStrip, type StatItem } from '@/components/layout/stat-strip';
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
  const isLowestNegative = lowestProjectedBalanceCents < 0;

  const lowestMonthLabel = lowestBalanceMonth
    ? formatMonthBR(`${lowestBalanceMonth}-01`)
    : '—';

  const finalMonthLabel = finalPoint
    ? formatMonthBR(`${finalPoint.month}-01`)
    : `${horizonMonths} meses`;

  const items: StatItem[] = [
    {
      label: 'Saldo Líquido Atual',
      value: <Money cents={currentBalanceCents} />,
      hint: 'Disponível em contas correntes e carteiras',
    },
    {
      label: `Saldo Projetado (${horizonMonths} Meses)`,
      value: (
        <span className={finalProjectedBalanceCents < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : undefined}>
          <Money cents={finalProjectedBalanceCents} />
        </span>
      ),
      hint: `Previsão para ${finalMonthLabel}`,
      tone: finalProjectedBalanceCents < 0 ? 'negative' : 'default',
    },
    {
      label: 'Menor Saldo Previsto',
      value: (
        <span className={isLowestNegative ? 'text-red-600 dark:text-red-400 font-semibold' : undefined}>
          <Money cents={lowestProjectedBalanceCents} />
        </span>
      ),
      hint: isLowestNegative
        ? `Risco de déficit em ${lowestMonthLabel}`
        : `Menor liquidez em ${lowestMonthLabel}`,
      tone: isLowestNegative ? 'negative' : 'default',
    },
    {
      label: 'Variação no Semestre',
      value: (
        <Money
          cents={netVariationCents}
          signed
          className={netVariationCents >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
        />
      ),
      hint: netVariationCents >= 0 ? 'Superávit líquido acumulado' : 'Redução líquida de caixa',
      tone: netVariationCents >= 0 ? 'positive' : 'negative',
    },
  ];

  return <StatStrip items={items} />;
}
