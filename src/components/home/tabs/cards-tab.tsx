import * as React from 'react';
import { CreditCard } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { getRequestAccountsOverview } from '@/server/queries/request-cache';
import { creditCardAccountIds } from '@/server/home/accounts';
import { summarizeAccounts } from '@/server/queries/dashboard';
import { getFutureInstallments } from '@/server/queries/installments';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories } from '@/server/queries/catalog';
import { categoryDimensionFor } from '@/server/queries/stats';
import { parseFilters } from '@/server/queries/url-filters';
import { today } from '@/server/domain/dates';
import dynamic from 'next/dynamic';
import {
  accountsTotals,
  parentCategoryIds,
} from '@/components/charts/links';
import { InvoicesHero } from '@/components/home/cards/invoices-hero';
import { CardTile, type CardTileAccount } from '@/components/home/cards/card-tile';
import { FutureInstallmentsChartSkeleton } from '@/components/invoices/future-installments-chart';
import { InstallmentsCardPicker } from '@/components/home/cards/installments-card-picker';
import { fillInstallmentMonths } from '@/components/invoices/invoice-summary';
import { BreakdownDonutSkeleton } from '@/components/charts/breakdown-donut';
import { EmptyState } from '@/components/states/empty-state';

const DynamicBreakdownDonut = dynamic(
  () => import('@/components/charts/breakdown-donut').then((m) => m.BreakdownDonut),
  { loading: () => <BreakdownDonutSkeleton /> },
);

const DynamicFutureInstallmentsChart = dynamic(
  () => import('@/components/invoices/future-installments-chart').then((m) => m.FutureInstallmentsChart),
  { loading: () => <FutureInstallmentsChartSkeleton /> },
);

export type CardsTabProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export async function CardsTab({ searchParams = {} }: CardsTabProps) {
  const filters = parseFilters(searchParams);
  const rawRosca = Array.isArray(searchParams.rosca) ? searchParams.rosca[0] : searchParams.rosca;
  const roscaMode = rawRosca === 'forma' ? 'forma' : 'categoria';
  const catDim = categoryDimensionFor(filters);

  const db = getDb();
  const overview = await getRequestAccountsOverview();

  const cardAccountIds = creditCardAccountIds(overview);
  const cardAccounts: CardTileAccount[] = [];

  for (const inst of overview) {
    for (const acc of inst.accounts) {
      if (acc.type === 'credit_card' && acc.includeInTotals && !acc.isHidden) {
        cardAccounts.push({
          id: acc.id,
          name: acc.name,
          displayName: acc.displayName,
          institution: {
            id: inst.institution.id,
            name: inst.institution.name,
            color: inst.institution.color,
          },
          credit: acc.credit,
        });
      }
    }
  }

  if (cardAccounts.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Nenhum cartão conectado"
        description="Assim que houver um cartão de crédito conectado, suas faturas, limites e parcelas aparecem aqui."
      />
    );
  }

  // Rosca e links só com os cartões, para a lista de transações bater com a fatia.
  const cardFilters = { ...filters, accountIds: cardAccountIds };
  const rawParcelas = Array.isArray(searchParams.parcelas) ? searchParams.parcelas[0] : searchParams.parcelas;
  const installmentsCard = cardAccounts.find((c) => c.id === rawParcelas) ?? null;
  const [categories, futureInstallmentsRaw, selectedInstallmentsRaw, byCategory, byPaymentMethod] = await Promise.all([
    listCategories(db),
    getFutureInstallments(db, { accountIds: cardAccountIds }),
    installmentsCard ? getFutureInstallments(db, { accountIds: [installmentsCard.id] }) : Promise.resolve([]),
    getBreakdown(db, cardFilters, catDim),
    getBreakdown(db, cardFilters, 'paymentMethod'),
  ]);

  const snapshot = summarizeAccounts(overview);
  const filledInstallments = fillInstallmentMonths(futureInstallmentsRaw, today());

  const { totalsAccountIds, hasExcluded } = accountsTotals(overview);
  const linkOpts = {
    ...(catDim === 'category' ? { parentIds: parentCategoryIds(categories) } : {}),
    ...(hasExcluded ? { totalsAccountIds } : {}),
  };

  const totalCents = byCategory.reduce((acc, c) => acc + c.totalCents, 0);

  return (
    <div className="space-y-6">
      <InvoicesHero
        openInvoicesCents={snapshot.openInvoicesCents}
        upcomingInvoices={snapshot.upcomingInvoices}
      />

      <section aria-label="Cartões de crédito">
        <div className="flex flex-col gap-3">
          {cardAccounts.map((account) => (
            <CardTile key={account.id} account={account} />
          ))}
        </div>
      </section>

      <DynamicFutureInstallmentsChart
        card={installmentsCard ? fillInstallmentMonths(selectedInstallmentsRaw, today()) : filledInstallments}
        all={filledInstallments}
        cardName={installmentsCard ? (installmentsCard.displayName ?? installmentsCard.name) : 'todos os cartões'}
        cardColor={installmentsCard ? installmentsCard.institution.color : '#3B82F6'}
        showScopeToggle={false}
        action={
          <InstallmentsCardPicker
            cards={cardAccounts.map((c) => ({
              id: c.id,
              name: c.displayName ?? c.name,
              institutionName: c.institution.name,
            }))}
            selectedId={installmentsCard?.id ?? null}
          />
        }
      />

      <DynamicBreakdownDonut
        title="Gastos no cartão"
        description="Clique para ver os lançamentos no período."
        mode={roscaMode}
        byCategory={byCategory}
        byPaymentMethod={byPaymentMethod}
        filters={cardFilters}
        linkOptions={linkOpts}
        totalCents={totalCents}
      />
    </div>
  );
}
