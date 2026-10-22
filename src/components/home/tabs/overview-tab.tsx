import Link from 'next/link';
import { getDb } from '@/server/db/client';
import { getAccountsOverview } from '@/server/queries/accounts';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories, listTags } from '@/server/queries/catalog';
import { getDashboardKpis, topWithOthers } from '@/server/queries/dashboard';
import { getMonthlySeries } from '@/server/queries/monthly';
import { previousPeriodLabel } from '@/server/queries/period-label';
import { categoryDimensionFor, trailingMonthsRange } from '@/server/queries/stats';
import { getLimitsOverview } from '@/server/queries/limits';
import { parseFilters } from '@/server/queries/url-filters';
import { FilterBar } from '@/components/filters';
import { PeriodOnlyBar } from '@/components/home/period-only-bar';
import { accountsTotals, categoryTransactionsHref, parentCategoryIds } from '@/components/charts/links';
import { NEUTRAL_COLOR, seriesColor } from '@/components/charts/palette';
import { SectionCard, SectionEmpty } from '@/components/charts/section-card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { CategoryDonut } from '@/components/dashboard/category-donut';
import { PaymentMethodBars } from '@/components/dashboard/payment-method-bars';
import { MonthlyStacked } from '@/components/dashboard/monthly-stacked';
import { TopMerchants, topMerchants } from '@/components/dashboard/top-merchants';
import { UpcomingInvoices } from '@/components/dashboard/upcoming-invoices';
import { DashboardLimitsWidget } from '@/components/limits/dashboard-limits-widget';

export type OverviewTabProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export async function OverviewTab({ searchParams }: OverviewTabProps) {
  const filters = parseFilters(searchParams);
  // Com `cat` na URL, a rosca quebra por categoria exata para o link não ampliar o filtro.
  const catDim = categoryDimensionFor(filters);
  const db = getDb();

  const overviewPromise = getAccountsOverview(db);
  const [
    overview,
    kpis,
    categories,
    tags,
    byCategory,
    byPaymentMethod,
    byMerchant,
    monthly,
    limitsOverview,
  ] = await Promise.all([
    overviewPromise,
    overviewPromise.then((o) => getDashboardKpis(db, filters, { overview: o })),
    listCategories(db),
    listTags(db),
    getBreakdown(db, filters, catDim),
    getBreakdown(db, filters, 'paymentMethod'),
    getBreakdown(db, filters, 'merchant'),
    getMonthlySeries(db, { ...filters, ...trailingMonthsRange(filters, 6) }, 'parentCategory', { top: 6 }),
    getLimitsOverview(db),
  ]);

  const prevLabel = previousPeriodLabel(filters);
  const totalCents = kpis.expenseCents;
  const { totalsAccountIds, hasExcluded } = accountsTotals(overview);
  const linkOpts = {
    ...(catDim === 'category' ? { parentIds: parentCategoryIds(categories) } : {}),
    ...(hasExcluded ? { totalsAccountIds } : {}),
  };

  const slices = topWithOthers(byCategory, 7).map((item, i) => ({
    key: item.key,
    label: item.label,
    color: item.isOthers ? NEUTRAL_COLOR : seriesColor(item.color, i),
    totalCents: item.totalCents,
    href: categoryTransactionsHref(filters, item.key, linkOpts),
  }));

  return (
    <div className="space-y-6">
      {/* Filtros completos no desktop, apenas seletor de período no celular */}
      <div className="hidden md:block">
        <FilterBar accounts={overview} categories={categories} tags={tags} />
      </div>
      <div className="md:hidden">
        <PeriodOnlyBar />
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          title="Gastos"
          cents={kpis.expenseCents}
          variation={{
            current: kpis.expenseCents,
            previous: kpis.previousExpenseCents,
            previousLabel: prevLabel,
            increaseIsBad: true,
          }}
        />
        <KpiCard
          title="Receitas"
          cents={kpis.incomeCents}
          variation={{
            current: kpis.incomeCents,
            previous: kpis.previousIncomeCents,
            previousLabel: prevLabel,
            increaseIsBad: false,
          }}
        />
        <KpiCard title="Saldo do período" cents={kpis.netCents} colored hint="Receitas − gastos" />
        <KpiCard
          title="Saldo em contas"
          cents={kpis.balanceCents}
          hint={`${kpis.institutionCount} ${kpis.institutionCount === 1 ? 'instituição' : 'instituições'} · situação atual`}
        />
        <KpiCard
          title="Faturas abertas"
          cents={kpis.openInvoicesCents}
          hint={`${kpis.cardCount} ${kpis.cardCount === 1 ? 'cartão' : 'cartões'} · situação atual`}
        />
        <KpiCard
          title="Parcelas futuras"
          cents={kpis.futureInstallmentsCents}
          hint="Próximos 12 meses · independe do período"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Gastos por categoria" description="Clique numa categoria para ver as transações.">
          {slices.length > 0 ? <CategoryDonut slices={slices} totalCents={totalCents} /> : <SectionEmpty />}
        </SectionCard>
        <SectionCard title="Gastos por forma de pagamento">
          {byPaymentMethod.length > 0 ? (
            <PaymentMethodBars
              items={byPaymentMethod}
              totalCents={totalCents}
              filters={filters}
              totalsAccountIds={hasExcluded ? totalsAccountIds : undefined}
            />
          ) : (
            <SectionEmpty />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Evolução mensal" description="Últimos 6 meses, empilhado por categoria.">
        <MonthlyStacked series={monthly} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardLimitsWidget overview={limitsOverview} />
        <SectionCard title="Top 5 estabelecimentos">
          <TopMerchants items={topMerchants(byMerchant, 5)} />
        </SectionCard>
        <SectionCard
          title="Próximas faturas"
          action={
            <Link href="/faturas" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Ver faturas
            </Link>
          }
        >
          <UpcomingInvoices invoices={kpis.upcomingInvoices} />
        </SectionCard>
      </div>
    </div>
  );
}
