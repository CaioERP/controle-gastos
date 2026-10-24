import { inArray } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { categories } from '@/server/db/schema';
import { getLimitsOverview, type SpendingLimitRow } from '@/server/queries/limits';

export type MonthlyLimitsSummary = {
  budgetedCents: number; // soma dos tetos das metas consideradas
  spentCents: number; // soma do gasto dessas metas no mês
  spentPercent: number; // inteiro, ex.: 64
  exceededCount: number; // metas consideradas com status 'exceeded'
  considered: number; // quantas metas entraram na soma
  critical: SpendingLimitRow[]; // até 3, maior spentPercent primeiro
};

export function dedupeParentChild<T extends { categoryId: string | null }>(
  limits: T[],
  parentOf: Map<string, string | null>,
): T[] {
  const categoryIds = new Set<string>();
  for (const l of limits) {
    if (l.categoryId) categoryIds.add(l.categoryId);
  }

  return limits.filter((l) => {
    if (!l.categoryId) return true;
    let curr = parentOf.get(l.categoryId);
    const visited = new Set<string>();
    while (curr && !visited.has(curr)) {
      if (categoryIds.has(curr)) {
        return false;
      }
      visited.add(curr);
      curr = parentOf.get(curr) ?? null;
    }
    return true;
  });
}

export async function getMonthlyLimitsSummary(
  db: Db,
  opts: { today?: string } = {},
): Promise<MonthlyLimitsSummary> {
  const overview = await getLimitsOverview(db, opts.today, { withSuggestions: false });

  // Filtro: isActive && period === 'monthly' && categoryId !== null && paymentMethod === null && accountId === null
  const filtered = overview.limits.filter(
    (l) =>
      l.isActive &&
      l.period === 'monthly' &&
      l.categoryId !== null &&
      l.paymentMethod === null &&
      l.accountId === null,
  );

  const catIds = [...new Set(filtered.map((l) => l.categoryId).filter((id): id is string => id !== null))];

  const catRows =
    catIds.length > 0
      ? await db
          .select({ id: categories.id, parentId: categories.parentId })
          .from(categories)
          .where(inArray(categories.id, catIds))
      : [];

  const parentOf = new Map<string, string | null>(
    catRows.map((r) => [r.id, r.parentId]),
  );

  const consideredLimits = dedupeParentChild(filtered, parentOf);

  let budgetedCents = 0;
  let spentCents = 0;
  let exceededCount = 0;

  for (const l of consideredLimits) {
    budgetedCents += l.amountCents;
    spentCents += l.spentCents;
    if (l.status === 'exceeded') {
      exceededCount++;
    }
  }

  const spentPercent =
    budgetedCents > 0 ? Math.round((spentCents * 100) / budgetedCents) : 0;

  const critical = [...consideredLimits]
    .sort((a, b) => b.spentPercent - a.spentPercent)
    .slice(0, 3);

  return {
    budgetedCents,
    spentCents,
    spentPercent,
    exceededCount,
    considered: consideredLimits.length,
    critical,
  };
}
