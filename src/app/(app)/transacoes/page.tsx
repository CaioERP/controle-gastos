import { getDb } from '@/server/db/client';
import { getAccountsOverview } from '@/server/queries/accounts';
import { listCategories, listTags } from '@/server/queries/catalog';
import { listTransactions } from '@/server/queries/transactions';
import { parseFilters, serializeFilters } from '@/server/queries/url-filters';
import { FilterBar } from '@/components/filters';
import { PageHeader } from '@/components/layout/page-header';
import { SearchInput } from '@/components/transactions/search-input';
import { TransactionList } from '@/components/transactions/transaction-list';

export const dynamic = 'force-dynamic';

const FIRST_PAGE = 100;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const db = getDb();
  const [accounts, categories, tags, page] = await Promise.all([
    getAccountsOverview(db),
    listCategories(db),
    listTags(db),
    listTransactions(db, filters, { limit: FIRST_PAGE }),
  ]);

  return (
    <div className="space-y-6">
      <FilterBar accounts={accounts} categories={categories} tags={tags} />
      <PageHeader
        title="Transações"
        description="Extrato unificado com busca, filtros e edição de categoria."
      />
      <SearchInput />
      {/* Filtros novos recriam a lista (zera páginas extras e o cursor). */}
      <TransactionList
        key={serializeFilters(filters)}
        initialItems={page.items}
        initialCursor={page.nextCursor}
        filters={filters}
        categories={categories}
        tags={tags}
      />
    </div>
  );
}
