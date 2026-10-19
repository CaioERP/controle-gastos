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
import { QuickCategories } from './quick-categories';
import { hasSuggestion, ReviewCard } from './review-card';

type ReviewQueueProps = {
  initialItems: TransactionRow[];
  initialCursor: string | null;
  count: number;
  categories: CategoryTree[];
  quick: FlatCategory[];
  bulk: ReviewSuggestion[];
};

const LEAVE_MS = 200;
const BULK_MIN_CONFIDENCE = 0.7;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTypingTarget(el: HTMLElement): boolean {
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

export function ReviewQueue({ initialItems, initialCursor, count, categories, quick, bulk }: ReviewQueueProps) {
  // A primeira página vem sempre do servidor (revalidada a cada ação); "Carregar mais" acrescenta as seguintes.
  const [extra, setExtra] = React.useState<TransactionRow[]>([]);
  const [extraCursor, setExtraCursor] = React.useState<string | null | undefined>(undefined);
  const [done, setDone] = React.useState<ReadonlySet<string>>(new Set());
  const [leaving, setLeaving] = React.useState<ReadonlySet<string>>(new Set());
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pickerFor, setPickerFor] = React.useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = React.useState<{ current: number; total: number } | null>(null);
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

  const resolve = React.useCallback(
    (tx: TransactionRow, run: () => Promise<ActionResult<{ updated: number }>>, message: string) => {
      setLeaving((s) => new Set(s).add(tx.id));
      setActiveId(nextAfter(tx.id));
      startAction(async () => {
        const [res] = await Promise.all([run(), delay(LEAVE_MS)]);
        if (!res.ok) {
          setLeaving((s) => {
            const n = new Set(s);
            n.delete(tx.id);
            return n;
          });
          toast.error(res.error.message);
          return;
        }
        startAction(() => {
          setDone((s) => new Set(s).add(tx.id));
          setLeaving((s) => {
            const n = new Set(s);
            n.delete(tx.id);
            return n;
          });
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
    (tx: TransactionRow) =>
      resolve(tx, () => markReviewedAction({ transactionIds: [tx.id] }), 'Transação revisada'),
    [resolve],
  );

  const skip = React.useCallback((tx: TransactionRow) => setActiveId(nextAfter(tx.id)), [nextAfter]);

  const quickAllowed = active ? categoryKindFor(active.kind) === 'expense' : false;
  const pickQuick = React.useCallback(
    (cat: FlatCategory) => {
      if (!active || categoryKindFor(active.kind) !== 'expense') return;
      // Com estabelecimento, vale para as transações dele (mesmo padrão do diálogo de B1-05).
      pick(active, cat, active.merchant ? 'similar' : 'this');
    },
    [active, pick],
  );

  // Atalhos: Enter confirmar · 1–9 categoria rápida · S pular · T transferência · C escolher outra
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement;
      if (isTypingTarget(target)) return;
      // Com seletor, diálogo ou painel aberto, as teclas pertencem a ele.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (!active || bulkProgress) return;
      const key = e.key.toLowerCase();
      if (key === 'enter') {
        if (target.closest('button, a')) return; // Enter num botão focado mantém o comportamento nativo
        e.preventDefault();
        if (hasSuggestion(active)) confirm(active);
        else if (!categoryKindFor(active.kind)) markReviewed(active);
        else setPickerFor(active.id);
      } else if (/^[1-9]$/.test(key)) {
        const cat = quick[Number(key) - 1];
        if (cat && quickAllowed) {
          e.preventDefault();
          pickQuick(cat);
        }
      } else if (key === 's') {
        e.preventDefault();
        skip(active);
      } else if (key === 't') {
        if (active.kind === 'transfer') return;
        e.preventDefault();
        setKind(active, 'transfer');
      } else if (key === 'c') {
        if (!categoryKindFor(active.kind)) return;
        e.preventDefault();
        setPickerFor(active.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, bulkProgress, confirm, markReviewed, pickQuick, quick, quickAllowed, setKind, skip]);

  const bulkPending = bulk.filter((s) => !done.has(s.transactionId));

  const runBulk = () => {
    const list = [...bulkPending];
    if (list.length === 0) return;
    startAction(async () => {
      let ok = 0;
      for (let i = 0; i < list.length; i++) {
        setBulkProgress({ current: i + 1, total: list.length });
        const s = list[i]!;
        const res = await recategorizeAction({ transactionId: s.transactionId, categoryId: s.categoryId, scope: 'this' });
        if (res.ok) {
          ok++;
          setDone((d) => new Set(d).add(s.transactionId));
        }
      }
      setBulkProgress(null);
      if (ok === list.length) toast.success(`${ok} sugest${ok === 1 ? 'ão confirmada' : 'ões confirmadas'}`);
      else toast.error(`${ok} de ${list.length} sugestões confirmadas; tente de novo as restantes.`);
    });
  };

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
        {bulkPending.length > 0 && (
          <Button
            variant="outline"
            onClick={runBulk}
            disabled={bulkProgress !== null}
            className="h-auto min-h-8 whitespace-normal py-1.5 text-left"
          >
            {bulkProgress
              ? `Confirmando ${bulkProgress.current} de ${bulkProgress.total}...`
              : `Confirmar todas as sugestões com confiança ≥ ${Math.round(BULK_MIN_CONFIDENCE * 100)}% (${bulkPending.length})`}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        count > 0 && cursor ? (
          <div className="flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Carregando...' : 'Carregar mais'}
            </Button>
          </div>
        ) : (
          <EmptyState icon={PartyPopperIcon} title="Tudo revisado 🎉" description="Não há transações esperando revisão." />
        )
      ) : (
        <>
          <QuickCategories categories={quick} disabled={!quickAllowed} onPick={pickQuick} />

          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Atalhos de teclado">
            <span><Kbd>Enter</Kbd> confirmar</span>
            <span><Kbd>1</Kbd>–<Kbd>9</Kbd> categoria rápida</span>
            <span><Kbd>S</Kbd> pular</span>
            <span><Kbd>T</Kbd> transferência</span>
            <span><Kbd>C</Kbd> escolher outra</span>
          </p>

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

          {cursor && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">{children}</kbd>;
}
