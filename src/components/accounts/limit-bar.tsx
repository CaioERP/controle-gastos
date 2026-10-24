'use client';

import * as React from 'react';
import { formatBRL } from '@/server/domain/money';
import { Sensitive } from '@/components/format/money';
import { cn } from '@/lib/utils';

type LimitBarProps = {
  limitCents: number | null;
  availableCents: number | null;
  className?: string;
};

export function LimitBar({ limitCents, availableCents, className }: LimitBarProps) {
  if (limitCents === null || limitCents <= 0) return null;

  const available = availableCents ?? 0;
  const used = Math.max(0, limitCents - available);
  const pct = Math.min(100, Math.max(0, Math.round((used / limitCents) * 100)));

  // A cor da barra segue o uso: neutra até 74%, âmbar de 75% a 89% e vermelha a partir de 90%.
  const barColor =
    pct >= 90
      ? 'bg-red-500 dark:bg-red-400'
      : pct >= 75
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-zinc-800 dark:bg-zinc-200';

  return (
    <div className={cn('flex items-center gap-2.5 w-full text-xs text-muted-foreground', className)}>
      <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-300', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        <Sensitive>
          {formatBRL(used)} de {formatBRL(limitCents)} ({pct}%)
        </Sensitive>
      </span>
    </div>
  );
}
