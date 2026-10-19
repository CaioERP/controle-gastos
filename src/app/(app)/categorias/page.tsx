import { getDb } from '@/server/db/client';
import { getAccountsOverview } from '@/server/queries/accounts';
import { listCategories, listMerchants, listRules } from '@/server/queries/catalog';
import { PageHeader } from '@/components/layout/page-header';
import { CatalogTabs, parseCatalogTab } from '@/components/catalog/catalog-tabs';
import { CategoryTree } from '@/components/catalog/category-tree';
import { RulesTable } from '@/components/catalog/rules-table';
import { MerchantsTable } from '@/components/catalog/merchants-table';
import { categoryOptionGroups } from '@/components/catalog/catalog-helpers';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CategoriasPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = parseCatalogTab(single(params.aba));
  const search = (single(params.q) ?? '').trim();
  const db = getDb();

  // Só busca o que a aba ativa usa; a árvore de categorias alimenta os selects de todas
  const [categories, rules, merchants, institutions] = await Promise.all([
    listCategories(db),
    tab === 'regras' ? listRules(db) : Promise.resolve([]),
    tab === 'estabelecimentos' ? listMerchants(db, { search: search || undefined, limit: 100 }) : Promise.resolve([]),
    tab === 'regras' ? getAccountsOverview(db, { includeHidden: true }) : Promise.resolve([]),
  ]);

  const categoryGroups = categoryOptionGroups(categories);
  const accounts = institutions.flatMap((inst) =>
    inst.accounts.map((a) => ({ id: a.id, name: `${a.displayName ?? a.name} · ${inst.institution.name}` })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias e regras"
        description="Organize as categorias, as regras de categorização automática e os estabelecimentos."
      />
      <CatalogTabs active={tab} />

      {tab === 'categorias' && <CategoryTree roots={categories} />}
      {tab === 'regras' && <RulesTable rules={rules} categoryGroups={categoryGroups} accounts={accounts} />}
      {tab === 'estabelecimentos' && (
        <MerchantsTable key={search} merchants={merchants} search={search} categoryGroups={categoryGroups} />
      )}
    </div>
  );
}
