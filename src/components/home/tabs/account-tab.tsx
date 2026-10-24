import * as React from 'react';
import { Landmark } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { getCashAccountsTab } from '@/server/home/cash-accounts';
import { getFreeToSpend } from '@/server/home/free-to-spend';
import { listTransactions } from '@/server/queries/transactions';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories, listTags } from '@/server/queries/catalog';
import { categoryDimensionFor } from '@/server/queries/stats';
import { parseFilters } from '@/server/queries/url-filters';
import { getAccountsOverview } from '@/server/queries/accounts';
import { accountsTotals, parentCategoryIds } from '@/components/charts/links';
import { PeriodOnlyBar } from '@/components/home/period-only-bar';
import { BalanceHero } from '@/components/home/account/balance-hero';
import { FreeToSpendWidget } from '@/components/home/account/free-to-spend';
import { BalanceChart } from '@/components/home/account/balance-chart';
import { CashFlowCard } from '@/components/home/account/cash-flow-card';
import { RecentTransactions } from '@/components/home/account/recent-transactions';
import { BreakdownDonut } from '@/components/charts/breakdown-donut';
import { EmptyState } from '@/components/states/empty-state';

export type AccountTabProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export async function AccountTab({ searchParams = {} }: AccountTabProps) {
  const filters = parseFilters(searchParams);
  const rawRosca = Array.isArray(searchParams.rosca) ? searchParams.rosca[0] : searchParams.rosca;
  const roscaMode = rawRosca === 'forma' ? 'forma' : 'categoria';
  const catDim = categoryDimensionFor(filters);

  const db = getDb();
  const tab = await getCashAccountsTab(db, { from: filters.from, to: filters.to });

  if (tab.accountIds.length === 0) {
    return (
      <div className="space-y-4">
        <PeriodOnlyBar />
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta corrente conectada"
          description="Assim que houver uma conta corrente conectada, seu saldo, livre para gastar e transações aparecem aqui."
        />
      </div>
    );
  }

  // A rosca e as transações consideram as contas correntes selecionadas nesta aba.
  const accountFilters = { ...filters, accountIds: tab.accountIds };

  const [freeToSpend, txList, categories, tags, byCategory, byPaymentMethod, overview] =
    await Promise.all([
      getFreeToSpend(db, { today: filters.to }),
      listTransactions(db, accountFilters, { limit: 5 }),
      listCategories(db),
      listTags(db),
      getBreakdown(db, accountFilters, catDim),
      getBreakdown(db, accountFilters, 'paymentMethod'),
      getAccountsOverview(db),
    ]);

  const { totalsAccountIds, hasExcluded } = accountsTotals(overview);
  const linkOpts = {
    ...(catDim === 'category' ? { parentIds: parentCategoryIds(categories) } : {}),
    ...(hasExcluded ? { totalsAccountIds } : {}),
  };

  const totalCents = byCategory.reduce((acc, c) => acc + c.totalCents, 0);

  return (
    <div className="space-y-6">
      <PeriodOnlyBar />

      <div className="space-y-3">
        <BalanceHero balanceCents={tab.balanceCents} institutions={tab.institutions} />
        <FreeToSpendWidget freeToSpend={freeToSpend} />
      </div>

      <BalanceChart history={tab.history} />

      <CashFlowCard flow={tab.flow} />

      <RecentTransactions
        transactions={txList.items}
        categories={categories}
        tags={tags}
        accountIds={tab.accountIds}
        filters={filters}
      />

      <BreakdownDonut
        title="Para onde foi o dinheiro da conta"
        description="Clique numa categoria para ver as transações."
        mode={roscaMode}
        byCategory={byCategory}
        byPaymentMethod={byPaymentMethod}
        filters={accountFilters}
        linkOptions={linkOpts}
        totalCents={totalCents}
      />
    </div>
  );
}
