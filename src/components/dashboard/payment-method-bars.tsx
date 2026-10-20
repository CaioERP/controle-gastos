import * as React from 'react';
import { HorizontalBars } from '@/components/charts/horizontal-bars';
import { paymentMethodTransactionsHref } from '@/components/charts/links';
import { paymentMethodColor } from '@/components/charts/palette';
import type { TxFilters } from '@/server/domain/filters';
import type { BreakdownItem } from '@/server/queries/breakdown';

type PaymentMethodBarsProps = {
  items: BreakdownItem[];
  totalCents: number;
  filters: TxFilters;
  totalsAccountIds?: string[];
};

/** Gastos por forma de pagamento; clique leva para /transacoes?forma=... */
export function PaymentMethodBars({ items, totalCents, filters, totalsAccountIds }: PaymentMethodBarsProps) {
  const linkOpts = totalsAccountIds ? { totalsAccountIds } : undefined;
  return (
    <HorizontalBars
      ariaLabel="Gastos por forma de pagamento"
      totalCents={totalCents}
      items={items.map((i) => ({
        key: i.key,
        label: i.label,
        color: paymentMethodColor(i.key),
        totalCents: i.totalCents,
        count: i.count,
        href: paymentMethodTransactionsHref(filters, i.key, linkOpts),
      }))}
    />
  );
}