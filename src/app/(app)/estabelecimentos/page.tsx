import { getDb } from '@/server/db/client';
import { listMerchantsWithSpend } from '@/server/queries/merchant-history';
import { PageHeader } from '@/components/layout/page-header';
import { MerchantsList } from '@/components/merchants/merchants-list';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MerchantsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : undefined;

  const db = getDb();
  const items = await listMerchantsWithSpend(db, { search: q });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estabelecimentos"
        description="Histórico de gastos e frequência por local nos últimos 12 meses."
      />
      <MerchantsList items={items} search={q} />
    </div>
  );
}
