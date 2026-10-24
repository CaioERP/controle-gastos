import { topWithOthers } from '@/server/queries/dashboard';
import {
  categoryTransactionsHref,
  paymentMethodTransactionsHref,
  type CategoryLinkOptions,
} from '@/components/charts/links';
import { NEUTRAL_COLOR, paymentMethodColor, seriesColor } from '@/components/charts/palette';
import type { BreakdownItem } from '@/server/queries/breakdown';
import type { TxFilters } from '@/server/domain/filters';

export type DonutSlice = {
  key: string;
  label: string;
  color: string;
  totalCents: number;
  href: string | null;
  isOthers?: boolean;
  grouped?: BreakdownItem[];
};

export function toDonutSlices(args: {
  items: BreakdownItem[];
  dimension: 'categoria' | 'forma';
  filters: TxFilters; // já com o recorte da aba (ex.: accountIds das contas de caixa)
  linkOptions?: CategoryLinkOptions;
  limit: number; // 5 no celular, 7 no desktop
}): DonutSlice[] {
  const { items, dimension, filters, linkOptions, limit } = args;

  const topItems = topWithOthers(items, limit);

  return topItems.map((item, index) => {
    let color: string;
    let href: string | null = null;

    if (item.isOthers) {
      color = NEUTRAL_COLOR;
    } else if (dimension === 'categoria') {
      color = seriesColor(item.color, index);
      href = categoryTransactionsHref(filters, item.key, linkOptions);
    } else {
      color = paymentMethodColor(item.key);
      href = paymentMethodTransactionsHref(filters, item.key, linkOptions);
    }

    return {
      key: item.key,
      label: item.label,
      color,
      totalCents: item.totalCents,
      href,
      isOthers: item.isOthers,
      grouped: item.grouped,
    };
  });
}
