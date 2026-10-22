'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PeriodPicker } from '@/components/filters/period-picker';
import { mergeFilterParams, parseFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';

export function PeriodOnlyBar() {
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

  return (
    <div className="flex items-center gap-2 w-full pb-2" data-slot="period-only-bar">
      <PeriodPicker
        from={filters.from}
        to={filters.to}
        onChange={({ from, to }) => updateFilters({ from, to })}
      />
    </div>
  );
}
