import { getDb } from '@/server/db/client';
import type { TxFilters } from '@/server/domain/filters';
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
  const params = await searchParams;
  const parsed = parseFilters(params);
  // Lista: sem `natureza` na URL mostra todas as naturezas (B1-02); totais das outras telas seguem R2.
  // O mesmo objeto vai para o TransactionList, então o "Carregar mais" pagina com o mesmo critério.
  const filters: TxFilters = params.natureza ? parsed : { ...parsed, kinds: undefined };
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
