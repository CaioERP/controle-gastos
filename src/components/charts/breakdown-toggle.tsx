'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export type BreakdownDimension = 'categoria' | 'forma';

export type BreakdownToggleProps = {
  param: 'rosca' | 'barras' | string;
  value?: BreakdownDimension;
  defaultValue?: BreakdownDimension;
  className?: string;
};

/**
 * Botões segmentados Categoria / Forma de pagamento.
 * Grava o valor escolhido no parâmetro de busca da URL indicado por `param`, preservando os demais filtros.
 */
export function BreakdownToggle({
  param,
  value,
  defaultValue = 'categoria',
  className,
}: BreakdownToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentFromUrl = searchParams.get(param) as BreakdownDimension | null;
  const active = (value ?? currentFromUrl ?? defaultValue) === 'forma' ? 'forma' : 'categoria';

  function setMode(next: BreakdownDimension) {
    if (next === active) return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(param, next);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <div
      role="group"
      aria-label="Agrupamento do gráfico"
      className={cn(
        'inline-flex items-center rounded-lg bg-muted p-0.5 text-xs font-medium text-muted-foreground',
        className
      )}
    >
      <button
        type="button"
        aria-pressed={active === 'categoria'}
        onClick={() => setMode('categoria')}
        className={cn(
          'rounded-md px-2.5 py-1 transition-all',
          active === 'categoria'
            ? 'bg-background text-foreground shadow-xs'
            : 'hover:text-foreground'
        )}
      >
        Categoria
      </button>
      <button
        type="button"
        aria-pressed={active === 'forma'}
        onClick={() => setMode('forma')}
        className={cn(
          'rounded-md px-2.5 py-1 transition-all',
          active === 'forma'
            ? 'bg-background text-foreground shadow-xs'
            : 'hover:text-foreground'
        )}
      >
        Forma de pagamento
      </button>
    </div>
  );
}
