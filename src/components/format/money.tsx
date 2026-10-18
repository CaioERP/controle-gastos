import * as React from 'react';
import { formatBRL } from '@/server/domain/money';
import { cn } from '@/lib/utils';

export interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  cents: number;
  signed?: boolean;
  colored?: boolean;
}

export function Money({ cents, signed = false, colored = false, className, ...props }: MoneyProps) {
  const formatted = formatBRL(Math.abs(cents));
  const isPositive = cents > 0;
  const isNegative = cents < 0;

  let display = formatted;
  if (signed) {
    if (isPositive) display = `+${formatted}`;
    else if (isNegative) display = `-${formatted}`;
  } else if (cents < 0) {
    display = `-${formatted}`;
  }

  const colorClass = colored
    ? isPositive
      ? 'text-emerald-600 dark:text-emerald-400'
      : isNegative
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground'
    : '';

  return (
    <span className={cn('tabular-nums font-medium', colorClass, className)} {...props}>
      {display}
    </span>
  );
}
