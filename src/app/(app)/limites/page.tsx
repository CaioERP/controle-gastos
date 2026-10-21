import { getDb } from '@/server/db/client';
import { getLimitsOverview } from '@/server/queries/limits';
import { listCategories } from '@/server/queries/catalog';
import { getAccountsOverview } from '@/server/queries/accounts';
import { LimitsView } from '@/components/limits/limits-view';

export const dynamic = 'force-dynamic';

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
    />
  );
}
