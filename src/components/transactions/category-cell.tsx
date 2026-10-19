'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { KIND_LABELS } from '@/server/domain/labels';
import type { CategoryTree } from '@/server/queries/catalog';
import type { TransactionRow } from '@/server/queries/transaction-row';
import { CategoryBadgeContent, SuggestionHint } from './category-badge';
import { CategoryPicker } from './category-picker';
import { RecategorizeDialog, type RecategorizeScope } from './recategorize-dialog';
import { categoryKindFor, type FlatCategory } from './tx-utils';

export type RecategorizeHandler = (tx: TransactionRow, category: FlatCategory, scope: RecategorizeScope) => void;

type CategoryCellProps = {
  tx: TransactionRow;
  categories: CategoryTree[];
  onRecategorize: RecategorizeHandler;
};

/**
 * Badge de categoria clicável: abre o seletor e, se houver estabelecimento, pergunta o alcance.
 * Naturezas sem categoria (R8) mostram só o badge da natureza.
 */
export function CategoryCell({ tx, categories, onRecategorize }: CategoryCellProps) {
  const [pending, setPending] = React.useState<FlatCategory | null>(null);
  const kind = categoryKindFor(tx.kind);

  if (!kind) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {KIND_LABELS[tx.kind]}
      </Badge>
    );
  }

  const handleSelect = (cat: FlatCategory) => {
    if (tx.merchant) setPending(cat);
    else onRecategorize(tx, cat, 'this');
  };

  const current = tx.category?.name ?? 'Sem categoria';

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <CategoryPicker
        categories={categories}
        kind={kind}
        value={tx.category?.id ?? null}
        onSelect={handleSelect}
        trigger={
          <button
            type="button"
            aria-label={`Alterar categoria (atual: ${current})`}
            className="min-w-0 max-w-full rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <CategoryBadgeContent category={tx.category} source={tx.categorySource} className="hover:brightness-95" />
          </button>
        }
      />
      {tx.category && <SuggestionHint source={tx.categorySource} confidence={tx.categoryConfidence} />}
      {tx.merchant && pending && (
        <RecategorizeDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          merchantName={tx.merchant.name}
          categoryName={pending.name}
          onChoose={(scope) => {
            const cat = pending;
            setPending(null);
            onRecategorize(tx, cat, scope);
          }}
        />
      )}
    </div>
  );
}
