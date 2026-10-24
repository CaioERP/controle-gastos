'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { PeriodPicker } from '@/components/filters/period-picker';
import { mergeFilterParams, parseFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';
import { cn } from '@/lib/utils';

export function PeriodOnlyBar({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const filters = React.useMemo(() => {
    return parseFilters(searchParams);
  }, [searchParams]);

  const updateFilters = React.useCallback(
    (patch: Partial<TxFilters>) => {
      const qs = mergeFilterParams(searchParams.toString(), patch, filters);
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [filters, pathname, router, searchParams],
  );

  return (
    <div
      className={cn('flex items-center gap-2', !compact && 'w-full pb-2', className)}
      data-slot="period-only-bar"
    >
      <PeriodPicker
        from={filters.from}
        to={filters.to}
        variant={compact ? 'compact' : 'default'}
        onChange={({ from, to }) => updateFilters({ from, to })}
      />
      {isPending && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
      )}
    </div>
  );
}
