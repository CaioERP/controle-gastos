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
import { getRequestAccountsOverview } from '@/server/queries/request-cache';
import type { AttentionItem } from '@/server/home/attention';
import { accountsTotals, parentCategoryIds } from '@/components/charts/links';
import { BalanceHero } from '@/components/home/account/balance-hero';
import { BalanceChart } from '@/components/home/account/balance-chart';
import { CashFlowCard } from '@/components/home/account/cash-flow-card';
import { RecentTransactions } from '@/components/home/account/recent-transactions';
import { AttentionStrip } from '@/components/home/attention-strip';
import { BreakdownDonut } from '@/components/charts/breakdown-donut';
import { EmptyState } from '@/components/states/empty-state';

export type AccountTabProps = {
  searchParams?: Record<string, string | string[] | undefined>;
  attention?: AttentionItem[];
};

export async function AccountTab({ searchParams = {}, attention = [] }: AccountTabProps) {
  const filters = parseFilters(searchParams);
  const rawRosca = Array.isArray(searchParams.rosca) ? searchParams.rosca[0] : searchParams.rosca;
  const roscaMode = rawRosca === 'forma' ? 'forma' : 'categoria';
  const catDim = categoryDimensionFor(filters);

  const db = getDb();
  const overview = await getRequestAccountsOverview();
  const tab = await getCashAccountsTab(db, { from: filters.from, to: filters.to }, { overview });

  if (tab.accountIds.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Nenhuma conta corrente conectada"
        description="Assim que houver uma conta corrente conectada, seu saldo, livre para gastar e transações aparecem aqui."
      />
    );
  }

  // A rosca e as transações consideram as contas correntes selecionadas nesta aba.
  const accountFilters = { ...filters, accountIds: tab.accountIds };

  const [freeToSpend, txList, categories, tags, byCategory, byPaymentMethod] =
    await Promise.all([
      getFreeToSpend(db, { today: filters.to, overview }),
      listTransactions(db, accountFilters, { limit: 5 }),
      listCategories(db),
      listTags(db),
      getBreakdown(db, accountFilters, catDim),
      getBreakdown(db, accountFilters, 'paymentMethod'),
    ]);

  const { totalsAccountIds, hasExcluded } = accountsTotals(overview);
  const linkOpts = {
    ...(catDim === 'category' ? { parentIds: parentCategoryIds(categories) } : {}),
    ...(hasExcluded ? { totalsAccountIds } : {}),
  };

  const totalCents = byCategory.reduce((acc, c) => acc + c.totalCents, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-x-10 md:gap-y-7">
      {/* 1. Herói: topo no celular, coluna esquerda (7/12) no desktop */}
      <div className="md:col-span-7 md:col-start-1">
        <BalanceHero freeToSpend={freeToSpend} institutions={tab.institutions} />
      </div>

      {/* 2. "Precisa de você": entre Herói e Saldo no celular, oculto no desktop */}
      {attention.length > 0 && (
        <div className="md:hidden">
          <AttentionStrip items={attention} mode="mobile-only" />
        </div>
      )}

      {/* 3. Saldo 90 dias: abaixo do herói / atenção no celular, coluna esquerda no desktop */}
      <div className="md:col-span-7 md:col-start-1">
        <BalanceChart history={tab.history} />
      </div>

      {/* 4. Fluxo das contas: após saldo no celular, coluna direita (5/12) linha 1 no desktop */}
      <div className="md:col-span-5 md:col-start-8 md:row-start-1">
        <CashFlowCard flow={tab.flow} />
      </div>

      {/* 5. Últimas transações: após fluxo no celular, coluna direita linha 2 no desktop */}
      <div className="md:col-span-5 md:col-start-8 md:row-start-2 md:row-span-2">
        <RecentTransactions
          transactions={txList.items}
          categories={categories}
          tags={tags}
          accountIds={tab.accountIds}
          filters={filters}
        />
      </div>

      {/* 6. Rosca: no fim no celular, coluna esquerda abaixo do gráfico no desktop */}
      <div className="md:col-span-7 md:col-start-1">
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
    </div>
  );
}
