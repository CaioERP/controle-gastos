import * as React from 'react';
import { StatStrip, type StatItem } from '@/components/layout/stat-strip';
import { Money } from '@/components/format/money';

type RecurrencesSummaryCardsProps = {
  monthlyTotalCents: number;
  yearlyTotalCents: number;
  activeCount: number;
  priceHikesCount: number;
};

export function RecurrencesSummaryCards({
  monthlyTotalCents,
  yearlyTotalCents,
  activeCount,
  priceHikesCount,
}: RecurrencesSummaryCardsProps) {
  const items: StatItem[] = [
    {
      label: 'Compromisso Mensal Fixo',
      value: <Money cents={monthlyTotalCents} tone="flow" />,
      hint: 'Total estimado por mês',
      testId: 'kpi-mensal-fixo',
    },
    {
      label: 'Total Anual Estimado',
      value: <Money cents={yearlyTotalCents} tone="flow" />,
      hint: 'Projeção em 12 meses',
      testId: 'kpi-anual-estimado',
    },
    {
      label: 'Assinaturas Ativas',
      value: activeCount,
      hint: `${activeCount} ${activeCount === 1 ? 'assinatura ativa' : 'assinaturas ativas'}`,
      testId: 'kpi-assinaturas-ativas',
    },
    {
      label: 'Aumentos Recentes',
      value: priceHikesCount,
      hint: `${priceHikesCount} ${priceHikesCount === 1 ? 'aumento identificado' : 'aumentos identificados'}`,
      tone: priceHikesCount > 0 ? 'warning' : 'default',
      testId: 'kpi-aumentos-recentes',
    },
  ];

  return <StatStrip items={items} />;
}
