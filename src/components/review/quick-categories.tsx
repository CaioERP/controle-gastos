'use client';

import * as React from 'react';
import { CategoryIcon } from '@/components/transactions/category-badge';
import type { FlatCategory } from '@/components/transactions/tx-utils';
import { cn } from '@/lib/utils';

type QuickCategoriesProps = {
  categories: FlatCategory[];
  /** A transação ativa não aceita categoria de despesa (ex.: receita ou transferência). */
  disabled: boolean;
  onPick: (category: FlatCategory) => void;
};

/** Até 9 categorias de despesa mais usadas, numeradas para as teclas 1–9. */
export function QuickCategories({ categories, disabled, onPick }: QuickCategoriesProps) {
  if (categories.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categorias rápidas</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Categorias rápidas">
        {categories.map((cat, i) => (
          <button
            key={cat.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(cat)}
            aria-keyshortcuts={String(i + 1)}
            aria-label={`${i + 1}: ${cat.name}`}
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <kbd className="flex size-5 shrink-0 items-center justify-center rounded border bg-muted font-mono text-[10px] text-muted-foreground">
              {i + 1}
            </kbd>
            <CategoryIcon name={cat.icon} className="size-3.5 shrink-0" style={{ color: cat.color }} />
            <span className="truncate">{cat.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
