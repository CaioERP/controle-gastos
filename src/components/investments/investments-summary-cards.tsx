import * as React from 'react';
import { StatStrip, type StatItem } from '@/components/layout/stat-strip';
import { Money, Sensitive } from '@/components/format/money';
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

  const items: StatItem[] = [
    {
      label: 'Patrimônio investido',
      value: <Money cents={totals.currentValueCents} />,
      hint: (
        <>
          Aplicado: <Sensitive>{formatBRL(totals.investedCents)}</Sensitive> · Líquido:{' '}
          <Sensitive>{formatBRL(totals.netValueCents)}</Sensitive>
        </>
      ),
    },
    {
      label: 'Rentabilidade bruta',
      value: (
        <span className="flex items-baseline gap-2">
          <Money cents={totals.profitCents} signed colored />
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            ({profitBadgeText})
          </span>
        </span>
      ),
      hint: 'Ganho sobre o total aplicado',
      tone: totals.profitBps >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Desempenho 12 meses (TWR)',
      value: twrText,
      hint: (
        <>
          CDI: {cdiText}
          {totals.percentOfCdi12m !== null ? (
            <span> ({totals.percentOfCdi12m.toString().replace('.', ',')}% do CDI)</span>
          ) : null}
        </>
      ),
      tone: totals.twr12mBps >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Proventos (12 meses)',
      value: <Money cents={totals.income12mCents} />,
      hint: 'Dividendos, JCP e rendimentos',
    },
  ];

  return <StatStrip items={items} />;
}
