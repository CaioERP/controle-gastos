import * as React from 'react';
import { StatStrip, type StatItem } from '@/components/layout/stat-strip';
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
      ? `${changes.yearDeltaBps >= 0 ? '+' : ''}${(changes.yearDeltaBps / 100).toFixed(2).replace('.', ',')}% no ano`
      : null;

  const items: StatItem[] = [
    {
      label: 'Patrimônio líquido',
      value: <Money cents={current.netWorthCents} />,
      hint: 'Ativos menos faturas e parcelas futuras',
    },
    {
      label: 'Total de ativos',
      value: <Money cents={current.assetsCents} />,
      hint: (
        <>
          Contas: <Sensitive>{formatBRL(current.cashAccountsCents)}</Sensitive> · Investimentos:{' '}
          <Sensitive>{formatBRL(current.investmentsCents)}</Sensitive>
        </>
      ),
    },
    {
      label: 'Total de compromissos (dívidas)',
      value: (
        <span className="text-amber-600 dark:text-amber-400 font-semibold">
          <Money cents={current.liabilitiesCents} />
        </span>
      ),
      hint: (
        <>
          Faturas: <Sensitive>{formatBRL(current.openInvoicesCents)}</Sensitive> · Parcelas:{' '}
          <Sensitive>{formatBRL(current.futureInstallmentsCents)}</Sensitive>
        </>
      ),
      tone: 'warning',
    },
    {
      label: 'Variação no mês / no ano',
      value: (
        <span className="flex items-baseline gap-2">
          {changes.monthDeltaCents !== null ? (
            <Money cents={changes.monthDeltaCents} signed colored />
          ) : (
            '—'
          )}
          {monthPercent && (
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              ({monthPercent})
            </span>
          )}
        </span>
      ),
      hint: yearPercent ?? 'Sem histórico anual',
      tone: changes.monthDeltaCents !== null ? (changes.monthDeltaCents >= 0 ? 'positive' : 'negative') : 'default',
    },
  ];

  return <StatStrip items={items} />;
}
