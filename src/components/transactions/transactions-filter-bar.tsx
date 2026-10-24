'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Calendar, Scale, SlidersHorizontal, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PeriodPicker } from '@/components/filters/period-picker';
import { ViewSelector } from '@/components/filters/view-selector';
import { BasisToggle } from '@/components/filters/basis-toggle';
import { MoreFilters } from '@/components/filters/more-filters';
import { ActiveFilterChips } from '@/components/filters/active-filter-chips';
import { SearchInput } from './search-input';
import { mergeFilterParams, parseFilters } from '@/server/queries/url-filters';
import { formatDateBR, formatMonthBR } from '@/server/domain/dates';
import type { TxFilters } from '@/server/domain/filters';
import { TX_KINDS, type TxKind } from '@/server/domain/enums';
import type { InstitutionWithAccounts } from '@/server/queries/accounts';
import type { CategoryTree } from '@/server/queries/catalog';

type TransactionsFilterBarProps = {
  accounts: InstitutionWithAccounts[];
  categories: CategoryTree[];
  tags: Array<{ id: string; name: string; color: string }>;
  defaultKinds?: readonly TxKind[];
};

export function TransactionsFilterBar({
  accounts,
  categories,
  tags,
  defaultKinds = TX_KINDS,
}: TransactionsFilterBarProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = React.useMemo(() => {
    return parseFilters(searchParams);
  }, [searchParams]);

  const updateFilters = React.useCallback(
    (patch: Partial<TxFilters>) => {
      const qs = mergeFilterParams(searchParams.toString(), patch, filters);
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [filters, pathname, router, searchParams],
  );

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

  // Conta filtros extras ativos além do padrão
  const activeCount = React.useMemo(() => {
    let count = 0;
    if (filters.institutionIds?.length) count += filters.institutionIds.length;
    if (filters.accountIds?.length) count += filters.accountIds.length;
    if (filters.categoryIds?.length) count += filters.categoryIds.length;
    if (filters.tagIds?.length) count += filters.tagIds.length;
    if (filters.paymentMethods?.length) count += filters.paymentMethods.length;
    if (filters.kinds?.length) count += filters.kinds.length;
    if (filters.includeProjected) count += 1;
    if (filters.needsReview) count += 1;
    if (filters.basis === 'cash') count += 1;
    return count;
  }, [filters]);

  // Rótulo do período
  const periodLabel = React.useMemo(() => {
    if (filters.from && filters.to && filters.from.slice(0, 7) === filters.to.slice(0, 7)) {
      return formatMonthBR(filters.from);
    }
    if (filters.from && filters.to) {
      return `${formatDateBR(filters.from).slice(0, 5)} - ${formatDateBR(filters.to).slice(0, 5)}`;
    }
    return 'Período';
  }, [filters.from, filters.to]);

  // Rótulo das contas
  const accountsLabel = React.useMemo(() => {
    if (filters.accountIds?.length) {
      return `${filters.accountIds.length} conta${filters.accountIds.length > 1 ? 's' : ''}`;
    }
    if (filters.institutionIds?.length) {
      return `${filters.institutionIds.length} inst.`;
    }
    return 'Todas as contas';
  }, [filters.accountIds, filters.institutionIds]);

  // Rótulo do regime
  const basisLabel = filters.basis === 'cash' ? 'Caixa' : 'Competência';

  return (
    <div className="flex flex-col gap-2.5 w-full pb-2" data-slot="transactions-filter-bar">
      {/* Linha de filtros: no desktop tem os pickers + busca; no celular tem busca + botão funil */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden md:flex flex-wrap items-center gap-2">
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
        </div>

        {/* Campo de busca: no celular divide a linha com o botão de filtro; no desktop ocupa o espaço restante */}
        <div className="flex-1 min-w-[180px]">
          <SearchInput className="sm:max-w-none" />
        </div>

        {/* Botão de abrir Sheet de filtros no celular */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSheetOpen(true)}
          aria-label="Filtros"
          className="relative h-9 shrink-0 gap-1.5 px-3 md:hidden"
        >
          <SlidersHorizontal className="size-4" />
          <span className="text-xs font-medium">Filtros</span>
          {activeCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      {/* Chips roláveis de filtros rápidos no celular */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <Calendar className="size-3" />
          <span>{periodLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <Wallet className="size-3" />
          <span>{accountsLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <Scale className="size-3" />
          <span>{basisLabel}</span>
        </button>
      </div>

      {/* Chips ativos no desktop */}
      <div className="hidden md:block">
        <ActiveFilterChips
          filters={filters}
          accounts={accounts}
          categories={categories}
          tags={tags}
          onRemove={(patch) => updateFilters(patch)}
          onClear={clearExtraFilters}
        />
      </div>

      {/* Sheet para filtros completos no celular */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 space-y-4">
          <SheetHeader className="pb-2">
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3">
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
            <ActiveFilterChips
              filters={filters}
              accounts={accounts}
              categories={categories}
              tags={tags}
              onRemove={(patch) => updateFilters(patch)}
              onClear={clearExtraFilters}
            />
          </div>
          <div className="pt-2">
            <SheetClose
              render={
                <Button className="w-full">
                  Concluir
                </Button>
              }
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
