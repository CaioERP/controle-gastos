import { getDb } from '@/server/db/client';
import { getAccountsOverview, listCategories, listTags } from '@/server/queries';
import { FilterBar } from '@/components/filters';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const db = getDb();
  const [accounts, categories, tags] = await Promise.all([
    getAccountsOverview(db),
    listCategories(db),
    listTags(db),
  ]);

  return (
    <div className="space-y-6">
      <FilterBar accounts={accounts} categories={categories} tags={tags} />
      <PageHeader
        title="Análise"
        description="Matriz de gastos por tipo e categoria, comparativos e rankings."
      />
      <EmptyState
        title="Em construção"
        description="Esta tela será implementada nas próximas etapas."
      />
    </div>
  );
}
