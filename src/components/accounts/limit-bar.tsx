'use client';

import * as React from 'react';
import { formatBRL } from '@/server/domain/money';
import { Sensitive } from '@/components/format/money';

type LimitBarProps = {
  limitCents: number | null;
  availableCents: number | null;
};

export function LimitBar({ limitCents, availableCents }: LimitBarProps) {
  if (limitCents === null || limitCents <= 0) return null;

  const available = availableCents ?? 0;
  const used = Math.max(0, limitCents - available);
  const pct = Math.min(100, Math.max(0, Math.round((used / limitCents) * 100)));

  return (
    <div className="flex flex-col gap-1 w-full text-xs">
      <div className="flex items-center justify-between text-muted-foreground text-[11px]">
        <span>Limite usado: <Sensitive>{formatBRL(used)}</Sensitive></span>
        <span>{pct}% de <Sensitive>{formatBRL(limitCents)}</Sensitive></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
