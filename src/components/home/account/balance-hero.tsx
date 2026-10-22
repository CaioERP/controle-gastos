import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import type { CashInstitution } from '@/server/home/cash-accounts';

type BalanceHeroProps = {
  balanceCents: number;
  institutions: CashInstitution[];
};

export function BalanceHero({ balanceCents, institutions }: BalanceHeroProps) {
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider block">
            Saldo em contas
          </span>
          <Money cents={balanceCents} className="text-2xl sm:text-3xl font-bold tracking-tight block" />
        </div>

        {institutions.length > 0 && (
          <div
            className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none"
            aria-label="Saldos por instituição"
          >
            {institutions.map((inst) => (
              <div
                key={inst.id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs shrink-0"
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: inst.color }}
                  aria-hidden
                />
                <span className="font-medium text-foreground">{inst.name}</span>
                <span className="text-muted-foreground">·</span>
                <Money cents={inst.balanceCents} className="text-foreground font-medium" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
