'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, Scale, SlidersHorizontal, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { FilterBar } from '@/components/filters';
import { SearchInput } from './search-input';
import { parseFilters } from '@/server/queries/url-filters';
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

/** Filtros extras ativos além do período (o número no botão de filtro do celular). */
function activeFilterCount(f: TxFilters): number {
  return (
    (f.institutionIds?.length ?? 0) +
    (f.accountIds?.length ?? 0) +
    (f.categoryIds?.length ?? 0) +
    (f.tagIds?.length ?? 0) +
    (f.paymentMethods?.length ?? 0) +
    (f.kinds?.length ?? 0) +
    (f.includeProjected ? 1 : 0) +
    (f.needsReview ? 1 : 0) +
    (f.basis === 'cash' ? 1 : 0)
  );
}

function periodLabel(f: TxFilters): string {
  if (f.from.slice(0, 7) === f.to.slice(0, 7)) return formatMonthBR(f.from);
  return `${formatDateBR(f.from).slice(0, 5)} - ${formatDateBR(f.to).slice(0, 5)}`;
}

function accountsLabel(f: TxFilters): string {
  if (f.accountIds?.length) return `${f.accountIds.length} conta${f.accountIds.length > 1 ? 's' : ''}`;
  if (f.institutionIds?.length) return `${f.institutionIds.length} inst.`;
  return 'Todas as contas';
}

const CHIP_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-muted-foreground hover:bg-muted/60 transition-colors';

/**
 * Filtros da página Transações. No desktop, a FilterBar com a busca na mesma linha;
 * no celular, busca + botão de filtro, chips de resumo e a FilterBar num Sheet vindo de baixo.
 */
export function TransactionsFilterBar({
  accounts,
  categories,
  tags,
  defaultKinds = TX_KINDS,
}: TransactionsFilterBarProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const searchParams = useSearchParams();
  const filters = React.useMemo(() => parseFilters(searchParams), [searchParams]);
  const activeCount = activeFilterCount(filters);
  const openSheet = () => setSheetOpen(true);

  return (
    <div className="flex flex-col gap-2.5 w-full" data-slot="transactions-filter-bar">
      <div className="hidden md:block">
        <FilterBar accounts={accounts} categories={categories} tags={tags} defaultKinds={defaultKinds}>
          <SearchInput className="sm:max-w-none" />
        </FilterBar>
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <SearchInput className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openSheet}
          aria-label="Filtros"
          className="relative h-9 shrink-0 gap-1.5 px-3"
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

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs md:hidden">
        <button type="button" onClick={openSheet} className={CHIP_CLASS}>
          <Calendar className="size-3" />
          <span>{periodLabel(filters)}</span>
        </button>
        <button type="button" onClick={openSheet} className={CHIP_CLASS}>
          <Wallet className="size-3" />
          <span>{accountsLabel(filters)}</span>
        </button>
        <button type="button" onClick={openSheet} className={CHIP_CLASS}>
          <Scale className="size-3" />
          <span>{filters.basis === 'cash' ? 'Caixa' : 'Competência'}</span>
        </button>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 space-y-4">
          <SheetHeader className="pb-2">
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <FilterBar accounts={accounts} categories={categories} tags={tags} defaultKinds={defaultKinds} />
          <SheetClose render={<Button className="w-full">Concluir</Button>} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
