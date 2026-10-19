'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PeriodPicker } from './period-picker';
import { ViewSelector } from './view-selector';
import { BasisToggle } from './basis-toggle';
import { MoreFilters } from './more-filters';
import { ActiveFilterChips } from './active-filter-chips';
import { mergeFilterParams, parseFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';
import type { InstitutionWithAccounts } from '@/server/queries/accounts';
import type { CategoryTree } from '@/server/queries/catalog';

type FilterBarProps = {
  accounts: InstitutionWithAccounts[];
  categories: CategoryTree[];
  tags: Array<{ id: string; name: string; color: string }>;
};

export function FilterBar({
  accounts,
  categories,
  tags,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Computa filtros ativos a partir da URL
  const filters = React.useMemo(() => {
    return parseFilters(searchParams);
  }, [searchParams]);

  // Reescreve só os parâmetros de filtro; os da página (dim, cartao, fatura, aba...) são preservados
  const updateFilters = React.useCallback(
    (patch: Partial<TxFilters>) => {
      const qs = mergeFilterParams(searchParams.toString(), patch, filters);
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [filters, pathname, router, searchParams]
  );

  // "Limpar" volta ao padrão preservando período e regime
  const clearExtraFilters = React.useCallback(() => {
    updateFilters({
      institutionIds: undefined,
      accountIds: undefined,
      kinds: undefined,
      paymentMethods: undefined,
      categoryIds: undefined,
      tagIds: undefined,
      search: undefined,
      includeProjected: undefined,
      needsReview: undefined,
    });
  }, [updateFilters]);

  return (
    <div className="flex flex-col gap-2.5 w-full pb-2" data-slot="filter-bar">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodPicker
          from={filters.from}
          to={filters.to}
          onChange={({ from, to }) => updateFilters({ from, to })}
        />

        <ViewSelector
          accounts={accounts}
          institutionIds={filters.institutionIds}
          accountIds={filters.accountIds}
          onChange={({ institutionIds, accountIds }) =>
            updateFilters({ institutionIds, accountIds })
          }
        />

        <BasisToggle
          basis={filters.basis ?? 'accrual'}
          onChange={(basis) => updateFilters({ basis })}
        />

        <MoreFilters
          paymentMethods={filters.paymentMethods}
          categoryIds={filters.categoryIds}
          tagIds={filters.tagIds}
          kinds={filters.kinds}
          includeProjected={filters.includeProjected}
          needsReview={filters.needsReview}
          categories={categories}
          tags={tags}
          onChange={(patch) => updateFilters(patch)}
        />
      </div>

      <ActiveFilterChips
        filters={filters}
        accounts={accounts}
        categories={categories}
        tags={tags}
        onRemove={(patch) => updateFilters(patch)}
        onClear={clearExtraFilters}
      />
    </div>
  );
}
