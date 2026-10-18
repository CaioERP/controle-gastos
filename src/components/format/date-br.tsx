import * as React from 'react';
import { formatDateBR } from '@/server/domain/dates';
import { cn } from '@/lib/utils';

export interface DateBRProps extends React.HTMLAttributes<HTMLSpanElement> {
  date: string; // YYYY-MM-DD
}

export function DateBR({ date, className, ...props }: DateBRProps) {
  return (
    <span className={cn('tabular-nums', className)} {...props}>
      {formatDateBR(date)}
    </span>
  );
}
