import * as React from 'react';
import { StatStrip, type StatItem } from '@/components/layout/stat-strip';
import { Money } from '@/components/format/money';

type LimitsSummaryCardsProps = {
  totalBudgetedCents: number;
  totalSpentCents: number;
  spentPercent: number;
  limitsCount: number;
  warningCount: number;
  exceededCount: number;
};

export function LimitsSummaryCards({
  totalBudgetedCents,
  totalSpentCents,
  spentPercent,
  limitsCount,
  warningCount,
  exceededCount,
}: LimitsSummaryCardsProps) {
  const items: StatItem[] = [
    {
      label: 'Total Orçado no Mês',
      value: <Money cents={totalBudgetedCents} />,
      hint: `${limitsCount} ${limitsCount === 1 ? 'meta ativa' : 'metas ativas'}`,
      testId: 'kpi-total-orcado',
    },
    {
      label: 'Total Gasto',
      value: <Money cents={totalSpentCents} tone="flow" />,
      hint: `${spentPercent}% do orçamento`,
      tone: spentPercent >= 100 ? 'negative' : spentPercent >= 80 ? 'warning' : 'flow',
      testId: 'kpi-total-gasto',
    },
    {
      label: 'Em Alerta (80–99%)',
      value: warningCount,
      hint: `${warningCount} ${warningCount === 1 ? 'meta próxima do teto' : 'metas próximas do teto'}`,
      tone: warningCount > 0 ? 'warning' : 'default',
      testId: 'kpi-limites-alerta',
    },
    {
      label: 'Estourados (≥ 100%)',
      value: exceededCount,
      hint: `${exceededCount} ${exceededCount === 1 ? 'meta ultrapassou o teto' : 'metas ultrapassaram o teto'}`,
      tone: exceededCount > 0 ? 'negative' : 'default',
      testId: 'kpi-limites-ultrapassados',
    },
  ];

  return <StatStrip items={items} />;
}
