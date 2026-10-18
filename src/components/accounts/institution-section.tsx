'use client';

import * as React from 'react';
import { AccountRow } from './account-row';
import { CardAccountRow } from './card-account-row';
import { Money } from '@/components/format/money';
import type { InstitutionWithAccounts } from '@/server/queries/accounts';

type InstitutionSectionProps = {
  data: InstitutionWithAccounts;
};

export function InstitutionSection({ data }: InstitutionSectionProps) {
  const { institution, totals, accounts } = data;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="h-3 w-3 rounded-full shrink-0 shadow-2xs"
            style={{ backgroundColor: institution.color }}
          />
          <h3 className="font-semibold text-base text-foreground">
            {institution.name}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>Saldo em contas:</span>
            <span className="font-semibold text-foreground tabular-nums">
              <Money cents={totals.balanceCents} />
            </span>
          </div>

          {totals.cardDebtCents > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Faturas abertas:</span>
              <span className="font-semibold text-foreground tabular-nums">
                <Money cents={totals.cardDebtCents} />
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-1">
        {accounts.map((acc) => {
          if (acc.type === 'credit_card') {
            return <CardAccountRow key={acc.id} account={acc} />;
          }
          return <AccountRow key={acc.id} account={acc} />;
        })}
      </div>
    </div>
  );
}
