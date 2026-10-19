import * as React from 'react';
import { cn } from '@/lib/utils';

/** Contagem de transações para revisar, exibida ao lado do item "Revisão" do menu. */
export function ReviewCountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      data-slot="review-count-badge"
      className={cn(
        'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold tabular-nums text-white',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
      <span className="sr-only"> para revisar</span>
    </span>
  );
}
