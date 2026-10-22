import * as React from 'react';
import { HorizontalBars, type HorizontalBarItem } from '@/components/charts/horizontal-bars';
import { categoryTransactionsHref, paymentMethodTransactionsHref } from '@/components/charts/links';
import { NEUTRAL_COLOR, paymentMethodColor, seriesColor } from '@/components/charts/palette';
import { SectionCard, SectionEmpty } from '@/components/charts/section-card';
import { BreakdownToggle, type BreakdownDimension } from '@/components/charts/breakdown-toggle';
import { topWithOthers } from '@/server/queries/dashboard';
import type { TxFilters } from '@/server/domain/filters';
import type { BreakdownItem } from '@/server/queries/breakdown';
import { cn } from '@/lib/utils';

type PaymentMethodBarsProps = {
  mode?: BreakdownDimension;
  byPaymentMethod: BreakdownItem[];
  byCategory?: BreakdownItem[];
  totalCents: number;
  filters: TxFilters;
  totalsAccountIds?: string[];
  parentIds?: ReadonlySet<string>;
  className?: string;
};

/**
 * Card de barras horizontais no desktop com toggle Categoria | Forma de pagamento.
 * Padrão é forma de pagamento. Fica oculto no celular (hidden md:block).
 */
export function PaymentMethodBars({
  mode = 'forma',
  byPaymentMethod,
  byCategory = [],
  totalCents,
  filters,
  totalsAccountIds,
  parentIds,
  className,
}: PaymentMethodBarsProps) {
  const linkOpts = totalsAccountIds ? { totalsAccountIds } : undefined;
  const isCategory = mode === 'categoria';
  const title = isCategory ? 'Gastos por categoria' : 'Gastos por forma de pagamento';

  let items: HorizontalBarItem[] = [];

  if (isCategory) {
    const topCats = topWithOthers(byCategory, 7);
    items = topCats.map((item, index) => ({
      key: item.key,
      label: item.label,
      color: item.isOthers ? NEUTRAL_COLOR : seriesColor(item.color, index),
      totalCents: item.totalCents,
      count: item.count,
      href: item.key === 'outras' ? null : categoryTransactionsHref(filters, item.key, { ...linkOpts, parentIds }),
    }));
  } else {
    items = byPaymentMethod.map((i) => ({
      key: i.key,
      label: i.label,
      color: paymentMethodColor(i.key),
      totalCents: i.totalCents,
      count: i.count,
      href: paymentMethodTransactionsHref(filters, i.key, linkOpts),
    }));
  }

  return (
    <SectionCard
      title={title}
      action={<BreakdownToggle param="barras" value={mode} defaultValue="forma" />}
      className={cn('hidden md:block', className)}
    >
      {items.length > 0 ? (
        <HorizontalBars ariaLabel={title} totalCents={totalCents} items={items} />
      ) : (
        <SectionEmpty />
      )}
    </SectionCard>
  );
}
