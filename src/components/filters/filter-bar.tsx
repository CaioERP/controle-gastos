'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { PeriodPicker } from './period-picker';
import { ViewSelector } from './view-selector';
import { BasisToggle } from './basis-toggle';
import { MoreFilters } from './more-filters';
import { ActiveFilterChips } from './active-filter-chips';
import { mergeFilterParams, parseFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';
import { REPORTABLE_KINDS, type TxKind } from '@/server/domain/enums';
import type { InstitutionWithAccounts } from '@/server/queries/accounts';
import type { CategoryTree } from '@/server/queries/catalog';
import { cn } from '@/lib/utils';

type FilterBarProps = {
  accounts: InstitutionWithAccounts[];
  categories: CategoryTree[];
  tags: Array<{ id: string; name: string; color: string }>;
  merchants?: Array<{ id: string; name: string }>;
  /**
   * Naturezas que a página considera quando a URL não tem `natureza` (só para exibir o seletor).
   * Agregações: reportáveis (R2, padrão). Lista de transações: todas.
   */
  defaultKinds?: readonly TxKind[];
  children?: React.ReactNode;
};

export function FilterBar({
  accounts,
  categories,
  tags,
  merchants,
  defaultKinds = REPORTABLE_KINDS,
  children,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Computa filtros ativos a partir da URL
  const filters = React.useMemo(() => {
    return parseFilters(searchParams);
  }, [searchParams]);

  const [isPending, startTransition] = React.useTransition();

  // Reescreve só os parâmetros de filtro; os da página (dim, cartao, fatura, aba...) são preservados
  const updateFilters = React.useCallback(
    (patch: Partial<TxFilters>) => {
      const qs = mergeFilterParams(searchParams.toString(), patch, filters);
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
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
      merchantIds: undefined,
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
          defaultKinds={defaultKinds}
          includeProjected={filters.includeProjected}
          needsReview={filters.needsReview}
          categories={categories}
          tags={tags}
          onChange={(patch) => updateFilters(patch)}
        />

        {children && <div className="flex-1 min-w-[200px]">{children}</div>}

        {isPending && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto animate-pulse">
            <Loader2 className="size-3.5 animate-spin" />
            <span className="hidden sm:inline">Atualizando…</span>
          </div>
        )}
      </div>

      <div className={cn(isPending && 'opacity-60 transition-opacity pointer-events-none')}>
        <ActiveFilterChips
          filters={filters}
          accounts={accounts}
          categories={categories}
          tags={tags}
          merchants={merchants}
          onRemove={(patch) => updateFilters(patch)}
          onClear={clearExtraFilters}
        />
      </div>
    </div>
  );
}
