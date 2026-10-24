import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatItem = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'negative' | 'flow';
  testId?: string;
};

const MD_COLS: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-3 lg:grid-cols-6',
};

const TONE_CLASSES: Record<NonNullable<StatItem['tone']>, string> = {
  default: 'text-foreground',
  positive: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  negative: 'text-red-700 dark:text-red-400',
  flow: 'text-foreground',
};

export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  const mdColsClass = MD_COLS[items.length] ?? 'md:grid-cols-4';

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px rounded-2xl overflow-hidden bg-border/60',
        mdColsClass,
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={index}
          data-testid={item.testId}
          className="bg-muted/40 p-4 md:p-5 flex flex-col justify-between min-w-0"
        >
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div
            className={cn(
              'text-xl md:text-2xl font-semibold tabular-nums tracking-tight mt-0.5 truncate',
              item.tone ? TONE_CLASSES[item.tone] : 'text-foreground',
            )}
          >
            {item.value}
          </div>
          {item.hint ? (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
