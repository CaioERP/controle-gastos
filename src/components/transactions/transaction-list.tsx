'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ReceiptIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states/empty-state';
import { cn } from '@/lib/utils';
import type { TxFilters } from '@/server/domain/filters';
import type { CategoryTree, TagWithCount } from '@/server/queries/catalog';
import type { TransactionRow as Tx } from '@/server/queries/transaction-row';
import { loadMoreAction, recategorizeAction } from '@/app/(app)/transacoes/actions';
import type { RecategorizeHandler } from './category-cell';
import { DayGroup } from './day-group';
import { ROW_GRID } from './transaction-row';
import { TransactionSheet } from './transaction-sheet';
import { groupByDay, pluralTransactions } from './tx-utils';

type Patch = { id: string; changes: Partial<Tx> };
type Override = { at: Tx[]; changes: Partial<Tx> };

type TransactionListProps = {
  initialItems: Tx[];
  initialCursor: string | null;
  filters: TxFilters;
  categories: CategoryTree[];
  tags: TagWithCount[];
};

function applyPatch(items: Tx[], p: Patch): Tx[] {
  return items.map((t) => (t.id === p.id ? { ...t, ...p.changes } : t));
}

export function TransactionList({ initialItems, initialCursor, filters, categories, tags }: TransactionListProps) {
  // Páginas extras carregadas por "Carregar mais"; a primeira página vem sempre do servidor (atualizada pelo revalidatePath).
  const [extra, setExtra] = React.useState<Tx[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(initialCursor);
  // Edições confirmadas, guardadas com a versão da primeira página em que foram feitas (`at`).
  const [overrides, setOverrides] = React.useState<Record<string, Override>>({});
  const [selected, setSelected] = React.useState<Tx | null>(null);
  const [loadingMore, startLoadMore] = React.useTransition();
  const [, startEdit] = React.useTransition();

  const merged = React.useMemo(() => {
    const fromServer = new Set(initialItems.map((t) => t.id));
    const seen = new Set<string>();
    const out: Tx[] = [];
    for (const t of [...initialItems, ...extra]) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      const o = overrides[t.id];
      // Quando o servidor manda a primeira página nova (revalidatePath), ela já traz a edição:
      // a edição local deixa de valer. Nas páginas extras, que o servidor não re-renderiza, ela continua.
      const valid = o && (!fromServer.has(t.id) || o.at === initialItems);
      out.push(valid ? { ...t, ...o.changes } : t);
    }
    return out;
  }, [initialItems, extra, overrides]);

  const [items, applyOptimistic] = React.useOptimistic(merged, applyPatch);
  const groups = React.useMemo(() => groupByDay(items), [items]);
  const multiYear = groups.length > 0 && groups[0]!.date.slice(0, 4) !== groups[groups.length - 1]!.date.slice(0, 4);

  const commit = React.useCallback(
    (p: Patch) => {
      setOverrides((o) => {
        const prev = o[p.id]?.at === initialItems ? o[p.id]!.changes : {};
        return { ...o, [p.id]: { at: initialItems, changes: { ...prev, ...p.changes } } };
      });
    },
    [initialItems],
  );

  const handleRecategorize = React.useCallback<RecategorizeHandler>(
    (tx, cat, scope) => {
      const patch: Patch = {
        id: tx.id,
        changes: {
          category: { id: cat.id, name: cat.name, color: cat.color, icon: cat.icon, parentName: cat.parentName },
          categorySource: 'user',
          categoryConfidence: 1,
          needsReview: false,
        },
      };
      startEdit(async () => {
        applyOptimistic(patch);
        const res = await recategorizeAction({ transactionId: tx.id, categoryId: cat.id, scope });
        if (!res.ok) {
          // Sem commit: ao fim da transição o useOptimistic volta ao valor anterior.
          toast.error(res.error.message);
          return;
        }
        startEdit(() => commit(patch));
        toast.success(`Categoria atualizada em ${pluralTransactions(res.data.updated)}`);
      });
    },
    [applyOptimistic, commit],
  );

  const handleOpen = React.useCallback((tx: Tx) => setSelected(tx), []);

  const loadMore = () => {
    if (!cursor) return;
    startLoadMore(async () => {
      const res = await loadMoreAction(filters, cursor);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setExtra((prev) => [...prev, ...res.data.items]);
      setCursor(res.data.nextCursor);
    });
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ReceiptIcon}
        title="Nenhuma transação encontrada"
        description="Ajuste o período, a busca ou os filtros para ver outras transações."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div
          className={cn(
            'hidden border-b px-3 py-2 text-xs font-medium text-muted-foreground md:grid md:gap-x-3',
            ROW_GRID,
          )}
          aria-hidden="true"
        >
          <span>Descrição</span>
          <span>Categoria</span>
          <span>Forma de pagamento</span>
          <span className="text-right">Valor</span>
        </div>
        {groups.map((g) => (
          <DayGroup
            key={g.date}
            group={g}
            showYear={multiYear}
            categories={categories}
            onOpen={handleOpen}
            onRecategorize={handleRecategorize}
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
        <span>{`Mostrando ${pluralTransactions(items.length)}`}</span>
        {cursor && (
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Carregando...' : 'Carregar mais'}
          </Button>
        )}
      </div>

      <TransactionSheet
        tx={selected ? (items.find((t) => t.id === selected.id) ?? selected) : null}
        categories={categories}
        tags={tags}
        onClose={() => setSelected(null)}
        onSaved={(id, changes) => commit({ id, changes })}
      />
    </div>
  );
}
