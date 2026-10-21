import { getDb } from '@/server/db/client';
import { getSubscriptionsSummary } from '@/server/queries/recurrences';
import { listCategories } from '@/server/queries/catalog';
import { getAccountsOverview } from '@/server/queries/accounts';
import { RecurrencesView } from '@/components/recurrences/recurrences-view';

export const dynamic = 'force-dynamic';

export default async function AssinaturasPage() {
  const db = getDb();

  const [summary, categories, accountsOverview] = await Promise.all([
    getSubscriptionsSummary(db),
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
    <RecurrencesView
      summary={summary}
      categories={categories}
      accounts={accountOptions}
    />
  );
}
