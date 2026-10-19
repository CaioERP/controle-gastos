import { getDb } from '@/server/db/client';
import { monthEnd, monthStart, today } from '@/server/domain/dates';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories, type CategoryTree } from '@/server/queries/catalog';
import { listReviewQueue, listReviewSuggestions } from '@/server/queries/review';
import { getReviewCount } from '@/server/queries/transactions';
import { PageHeader } from '@/components/layout/page-header';
import { ReviewQueue } from '@/components/review/review-queue';
import { findCategory, type FlatCategory } from '@/components/transactions/tx-utils';

export const dynamic = 'force-dynamic';

const QUICK_COUNT = 9;

/**
 * Categorias rápidas: as de despesa mais usadas no mês; se o mês ainda tiver poucas,
 * completa com as mais usadas no histórico.
 */
function quickCategories(monthKeys: string[], tree: CategoryTree[]): FlatCategory[] {
  const out: FlatCategory[] = [];
  const add = (id: string) => {
    if (out.length >= QUICK_COUNT || out.some((c) => c.id === id)) return;
    const cat = findCategory(tree, id);
    const root = tree.find((r) => r.id === id || r.children.some((c) => c.id === id));
    if (cat && root?.kind === 'expense' && !root.archived) out.push(cat);
  };
  monthKeys.forEach(add);
  const byUse = tree
    .filter((r) => r.kind === 'expense' && !r.archived)
    .flatMap((r) => [r, ...r.children.filter((c) => !c.archived)])
    .sort((a, b) => b.transactionCount - a.transactionCount);
  byUse.forEach((c) => add(c.id));
  return out;
}

export default async function Page() {
  const db = getDb();
  const ref = today();
  const [count, page, categories, suggestions, monthBreakdown] = await Promise.all([
    getReviewCount(db),
    listReviewQueue(db, { limit: 30 }),
    listCategories(db),
    listReviewSuggestions(db, 0.7),
    getBreakdown(db, { from: monthStart(ref), to: monthEnd(ref), kinds: ['expense'] }, 'category'),
  ]);

  const monthKeys = [...monthBreakdown]
    .filter((b) => b.key !== 'uncategorized')
    .sort((a, b) => b.count - a.count || b.totalCents - a.totalCents)
    .map((b) => b.key);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisão"
        description="Confirme ou corrija as categorias que a automação não teve certeza."
      />
      <ReviewQueue
        initialItems={page.items}
        initialCursor={page.nextCursor}
        count={count}
        categories={categories}
        quick={quickCategories(monthKeys, categories)}
        bulk={suggestions}
      />
    </div>
  );
}
