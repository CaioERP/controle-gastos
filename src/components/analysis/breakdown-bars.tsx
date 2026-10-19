import * as React from 'react';
import { HorizontalBars } from '@/components/charts/horizontal-bars';
import type { BreakdownItem } from '@/server/queries/breakdown';

type BreakdownBarsProps = {
  items: BreakdownItem[];
  totalCents: number;
  ariaLabel: string;
  colorFor: (item: BreakdownItem, index: number) => string;
  hrefFor: (item: BreakdownItem) => string | null;
};

/** Barras horizontais com valor, % e nº de transações. */
export function BreakdownBars({ items, totalCents, ariaLabel, colorFor, hrefFor }: BreakdownBarsProps) {
  return (
    <HorizontalBars
      ariaLabel={ariaLabel}
      totalCents={totalCents}
      showCount
      items={items.map((item, i) => ({
        key: item.key,
        label: item.label,
        color: colorFor(item, i),
        totalCents: item.totalCents,
        count: item.count,
        href: hrefFor(item),
      }))}
    />
  );
}
