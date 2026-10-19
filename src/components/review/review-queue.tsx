'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { PartyPopperIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/states/empty-state';
import type { RecategorizeScope } from '@/components/transactions/recategorize-dialog';
import { categoryKindFor, pluralTransactions, type FlatCategory } from '@/components/transactions/tx-utils';
import type { ActionResult } from '@/lib/action';
import type { CategoryTree } from '@/server/queries/catalog';
import type { ReviewSuggestion } from '@/server/queries/review';
import type { TransactionRow } from '@/server/queries/transaction-row';
import {
  loadMoreReviewAction,
  markReviewedAction,
  recategorizeAction,
  setKindAndReviewAction,
} from '@/app/(app)/revisao/actions';
import { BulkConfirm } from './bulk-confirm';
import { QuickCategories } from './quick-categories';
import { hasSuggestion, ReviewCard } from './review-card';
import { ShortcutLegend } from './shortcut-legend';
import { useReviewShortcuts } from './use-review-shortcuts';

type ReviewQueueProps = {
  initialItems: TransactionRow[];
  initialCursor: string | null;
  count: number;
  categories: CategoryTree[];
  quick: FlatCategory[];
  bulk: ReviewSuggestion[];
};

const LEAVE_MS = 200;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

export function ReviewQueue({ initialItems, initialCursor, count, categories, quick, bulk }: ReviewQueueProps) {
  // A primeira página vem sempre do servidor (revalidada a cada ação); "Carregar mais" acrescenta as seguintes.
  const [extra, setExtra] = React.useState<TransactionRow[]>([]);
  const [extraCursor, setExtraCursor] = React.useState<string | null | undefined>(undefined);
  const [done, setDone] = React.useState<ReadonlySet<string>>(new Set());
  const [leaving, setLeaving] = React.useState<ReadonlySet<string>>(new Set());
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pickerFor, setPickerFor] = React.useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = React.useState(false);
  const [loadingMore, startLoadMore] = React.useTransition();
  const [, startAction] = React.useTransition();
  const cardRefs = React.useRef(new Map<string, HTMLElement>());

  const items = React.useMemo(() => {
    const seen = new Set<string>();
    const out: TransactionRow[] = [];
    for (const t of [...initialItems, ...extra]) {
      if (seen.has(t.id) || done.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    return out;
  }, [initialItems, extra, done]);

  const available = React.useMemo(() => items.filter((t) => !leaving.has(t.id)), [items, leaving]);
  const active = available.find((t) => t.id === activeId) ?? available[0] ?? null;
  const cursor = extraCursor === undefined ? initialCursor : extraCursor;

  /** Próximo card depois de `id` (volta ao início no fim da fila). */
  const nextAfter = React.useCallback(
    (id: string): string | null => {
      const idx = available.findIndex((t) => t.id === id);
      const rest = [...available.slice(idx + 1), ...available.slice(0, Math.max(idx, 0))].filter((t) => t.id !== id);
      return rest[0]?.id ?? null;
    },
    [available],
  );

  // Foco acompanha o card ativo, para o teclado (Enter) agir nele e não num botão de outro card.
  const activeKey = active?.id ?? null;
  React.useEffect(() => {
    if (!activeKey) return;
    const el = cardRefs.current.get(activeKey);
    if (el && !el.contains(document.activeElement)) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeKey]);

  /** Tira o card da fila (com animação) enquanto a action roda; se falhar, ele volta. */
  const resolve = React.useCallback(
    (tx: TransactionRow, run: () => Promise<ActionResult<{ updated: number }>>, message: string) => {
      setLeaving((s) => new Set(s).add(tx.id));
      setActiveId(nextAfter(tx.id));
      startAction(async () => {
        const [res] = await Promise.all([run(), delay(LEAVE_MS)]);
        if (!res.ok) {
          setLeaving((s) => without(s, tx.id));
          toast.error(res.error.message);
          return;
        }
        startAction(() => {
          setDone((s) => new Set(s).add(tx.id));
          setLeaving((s) => without(s, tx.id));
        });
        toast.success(message);
      });
    },
    [nextAfter],
  );

  const pick = React.useCallback(
    (tx: TransactionRow, cat: FlatCategory, scope: RecategorizeScope) =>
      resolve(
        tx,
        () => recategorizeAction({ transactionId: tx.id, categoryId: cat.id, scope }),
        `“${tx.description}” em ${cat.name}`,
      ),
    [resolve],
  );

  const confirm = React.useCallback(
    (tx: TransactionRow) => {
      if (!hasSuggestion(tx)) return;
      resolve(
        tx,
        () => recategorizeAction({ transactionId: tx.id, categoryId: tx.category!.id, scope: 'similar' }),
        `Sugestão confirmada: ${tx.category!.name}`,
      );
    },
    [resolve],
  );

  const setKind = React.useCallback(
    (tx: TransactionRow, kind: 'transfer' | 'invoice_payment') =>
      resolve(
        tx,
        () => setKindAndReviewAction({ transactionId: tx.id, kind }),
        kind === 'transfer' ? 'Marcada como transferência' : 'Marcada como pagamento de fatura',
      ),
    [resolve],
  );

  const markReviewed = React.useCallback(
    (tx: TransactionRow) => resolve(tx, () => markReviewedAction({ transactionIds: [tx.id] }), 'Transação revisada'),
    [resolve],
  );

  const skip = React.useCallback((tx: TransactionRow) => setActiveId(nextAfter(tx.id)), [nextAfter]);
  const openPicker = React.useCallback((tx: TransactionRow) => setPickerFor(tx.id), []);
  const markTransfer = React.useCallback((tx: TransactionRow) => setKind(tx, 'transfer'), [setKind]);

  const quickAllowed = active ? categoryKindFor(active.kind) === 'expense' : false;
  // Categoria rápida vale só para a transação atual: uma tecla nunca altera outras sem o usuário ver.
  const pickQuick = React.useCallback(
    (cat: FlatCategory) => {
      if (!active || categoryKindFor(active.kind) !== 'expense') return;
      pick(active, cat, 'this');
    },
    [active, pick],
  );

  useReviewShortcuts({
    active,
    disabled: bulkRunning,
    quick,
    quickAllowed,
    onConfirm: confirm,
    onMarkReviewed: markReviewed,
    onOpenPicker: openPicker,
    onQuick: pickQuick,
    onSkip: skip,
    onTransfer: markTransfer,
  });

  const bulkPending = bulk.filter((s) => !done.has(s.transactionId));
  const markDone = React.useCallback((id: string) => setDone((d) => new Set(d).add(id)), []);

  const loadMore = () => {
    if (!cursor) return;
    startLoadMore(async () => {
      const res = await loadMoreReviewAction(cursor);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setExtra((prev) => [...prev, ...res.data.items]);
      setExtraCursor(res.data.nextCursor);
    });
  };

  const loadMoreButton = cursor ? (
    <div className="flex justify-center">
      <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
        {loadingMore ? 'Carregando...' : 'Carregar mais'}
      </Button>
    </div>
  ) : null;

  const handlers = {
    onActivate: (tx: TransactionRow) => setActiveId(tx.id),
    onConfirm: confirm,
    onPick: pick,
    onKind: setKind,
    onMarkReviewed: markReviewed,
    onSkip: skip,
    onPickerOpenChange: (tx: TransactionRow, open: boolean) => setPickerFor(open ? tx.id : null),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium" aria-live="polite" data-testid="review-count">
          {count === 0 ? 'Nenhuma transação para revisar' : `${pluralTransactions(count)} para revisar`}
        </p>
        <BulkConfirm pending={bulkPending} onConfirmed={markDone} onRunningChange={setBulkRunning} />
      </div>

      {items.length === 0 ? (
        count > 0 && cursor ? (
          loadMoreButton
        ) : (
          <EmptyState icon={PartyPopperIcon} title="Tudo revisado 🎉" description="Não há transações esperando revisão." />
        )
      ) : (
        <>
          <QuickCategories categories={quick} disabled={!quickAllowed} onPick={pickQuick} />
          <ShortcutLegend />
          <div className="space-y-3">
            {items.map((tx) => (
              <ReviewCard
                key={tx.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(tx.id, el);
                  else cardRefs.current.delete(tx.id);
                }}
                tx={tx}
                categories={categories}
                active={active?.id === tx.id}
                leaving={leaving.has(tx.id)}
                pickerOpen={pickerFor === tx.id}
                {...handlers}
              />
            ))}
          </div>
          {loadMoreButton}
        </>
      )}
    </div>
  );
}
