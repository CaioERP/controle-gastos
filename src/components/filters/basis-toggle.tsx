'use client';

import * as React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from 'cn';

type BasisToggleProps = {
  basis: 'accrual' | 'cash';
  onChange: (basis: 'accrual' | 'cash') => void;
};

export function BasisToggle({ basis, onChange }: BasisToggleProps) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              role="group"
              aria-label="Regime contábil"
              className="inline-flex h-9 items-center rounded-lg border bg-muted/50 p-1 text-muted-foreground shadow-xs"
            >
              <button
                type="button"
                onClick={() => onChange('accrual')}
                className={cn(
                  'inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer',
                  basis === 'accrual'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={basis === 'accrual'}
              >
                Competência
              </button>
              <button
                type="button"
                onClick={() => onChange('cash')}
                className={cn(
                  'inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer',
                  basis === 'cash'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={basis === 'cash'}
              >
                Caixa
              </button>
            </div>
          }
        />
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          Competência: gasto na data da compra. Caixa: gasto de cartão no mês do vencimento da fatura.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
