import * as React from 'react';
import { getDb } from '@/server/db/client';
import { getLimitsOverview, type SuggestedBudgetRow } from '@/server/queries/limits';
import { listCategories } from '@/server/queries/catalog';
import { getAccountsOverview } from '@/server/queries/accounts';
import { suggestBudgets } from '@/server/limits/suggest';
import { today } from '@/server/domain/dates';
import { LimitsView } from '@/components/limits/limits-view';
import { SuggestedBudgetsBanner } from '@/components/limits/suggested-budgets-banner';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

async function AsyncSuggestionsBanner() {
  const db = getDb();
  const rawSuggestions = await suggestBudgets(db, today());
  const suggestions: SuggestedBudgetRow[] = rawSuggestions.map((s) => ({
    categoryId: s.categoryId,
    categoryName: s.categoryName,
    categoryColor: s.categoryColor,
    average3mCents: s.averageCents,
    suggestedCents: s.suggestedAmountCents,
    currentLimitCents: s.currentLimitCents,
  }));
  return <SuggestedBudgetsBanner suggestions={suggestions} />;
}

export default async function LimitesPage() {
  const db = getDb();

  const [overview, categories, accountsOverview] = await Promise.all([
    getLimitsOverview(db),
    listCategories(db),
    getAccountsOverview(db, { includeHidden: false }),
  ]);

  const accountOptions = accountsOverview.flatMap((inst) =>
    inst.accounts.map((a) => ({
      id: a.id,
      name: `${inst.institution.name} — ${a.displayName ?? a.name}`,
    })),
  );

  return (
    <LimitsView
      overview={overview}
      categories={categories}
      accounts={accountOptions}
      suggestionsSlot={
        <React.Suspense
          fallback={
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 h-28 flex flex-col justify-between animate-pulse">
              <Skeleton className="h-4 w-40" />
              <div className="flex gap-3">
                <Skeleton className="h-8 w-44 rounded-lg" />
                <Skeleton className="h-8 w-36 rounded-lg" />
              </div>
            </div>
          }
        >
          <AsyncSuggestionsBanner />
        </React.Suspense>
      }
    />
  );
}
