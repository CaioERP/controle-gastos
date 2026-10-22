import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { getAccountsOverview } from '@/server/queries/accounts';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories, listTags } from '@/server/queries/catalog';
import { getDashboardKpis, topWithOthers } from '@/server/queries/dashboard';
import { getMonthlySeries } from '@/server/queries/monthly';
import { previousPeriodLabel } from '@/server/queries/period-label';
import { categoryDimensionFor, trailingMonthsRange } from '@/server/queries/stats';
import { getSpendingPace } from '@/server/home/pace';
import { getMonthlyLimitsSummary } from '@/server/home/limits-summary';
import { parseFilters, withFilters } from '@/server/queries/url-filters';
import { FilterBar } from '@/components/filters';
import { PeriodOnlyBar } from '@/components/home/period-only-bar';
import {
  accountsTotals,
  categoryTransactionsHref,
  parentCategoryIds,
  paymentMethodTransactionsHref,
} from '@/components/charts/links';
import { NEUTRAL_COLOR, paymentMethodColor, seriesColor } from '@/components/charts/palette';
import { SectionCard } from '@/components/charts/section-card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { BreakdownDonut } from '@/components/charts/breakdown-donut';
import { PaymentMethodBars } from '@/components/dashboard/payment-method-bars';
import { MonthlyStacked } from '@/components/dashboard/monthly-stacked';
import { TopMerchants, topMerchants } from '@/components/dashboard/top-merchants';
import { UpcomingInvoices } from '@/components/dashboard/upcoming-invoices';
import { PaceChart } from '@/components/home/overview/pace-chart';
import { LimitsSummaryCard } from '@/components/home/overview/limits-summary-card';
import { Money } from '@/components/format/money';

export type OverviewTabProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export async function OverviewTab({ searchParams }: OverviewTabProps) {
  const filters = parseFilters(searchParams);
  const rawRosca = Array.isArray(searchParams.rosca) ? searchParams.rosca[0] : searchParams.rosca;
  const roscaMode = rawRosca === 'forma' ? 'forma' : 'categoria';
  const rawBarras = Array.isArray(searchParams.barras) ? searchParams.barras[0] : searchParams.barras;
  const barrasMode = rawBarras === 'categoria' ? 'categoria' : 'forma';

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
    pace,
    limitsSummary,
  ] = await Promise.all([
    overviewPromise,
    overviewPromise.then((o) => getDashboardKpis(db, filters, { overview: o })),
    listCategories(db),
    listTags(db),
    getBreakdown(db, filters, catDim),
    getBreakdown(db, filters, 'paymentMethod'),
    getBreakdown(db, filters, 'merchant'),
    getMonthlySeries(db, { ...filters, ...trailingMonthsRange(filters, 6) }, 'parentCategory', { top: 6 }),
    getSpendingPace(db, filters),
    getMonthlyLimitsSummary(db),
  ]);

  const prevLabel = previousPeriodLabel(filters);
  const totalCents = kpis.expenseCents;
  const { totalsAccountIds, hasExcluded } = accountsTotals(overview);
  const linkOpts = {
    ...(catDim === 'category' ? { parentIds: parentCategoryIds(categories) } : {}),
    ...(hasExcluded ? { totalsAccountIds } : {}),
  };

  const categorySlices = topWithOthers(byCategory, 7).map((item, i) => ({
    key: item.key,
    label: item.label,
    color: item.isOthers ? NEUTRAL_COLOR : seriesColor(item.color, i),
    totalCents: item.totalCents,
    href: item.isOthers ? null : categoryTransactionsHref(filters, item.key, linkOpts),
    isOthers: item.isOthers,
    grouped: item.grouped,
  }));
  const categorySlicesMobile = topWithOthers(byCategory, 5).map((item, i) => ({
    key: item.key,
    label: item.label,
    color: item.isOthers ? NEUTRAL_COLOR : seriesColor(item.color, i),
    totalCents: item.totalCents,
    href: item.isOthers ? null : categoryTransactionsHref(filters, item.key, linkOpts),
    isOthers: item.isOthers,
    grouped: item.grouped,
  }));

  const pmSlices = topWithOthers(byPaymentMethod, 7).map((item) => ({
    key: item.key,
    label: item.label,
    color: item.isOthers ? NEUTRAL_COLOR : paymentMethodColor(item.key),
    totalCents: item.totalCents,
    href: item.isOthers ? null : paymentMethodTransactionsHref(filters, item.key, linkOpts),
    isOthers: item.isOthers,
    grouped: item.grouped,
  }));
  const pmSlicesMobile = topWithOthers(byPaymentMethod, 5).map((item) => ({
    key: item.key,
    label: item.label,
    color: item.isOthers ? NEUTRAL_COLOR : paymentMethodColor(item.key),
    totalCents: item.totalCents,
    href: item.isOthers ? null : paymentMethodTransactionsHref(filters, item.key, linkOpts),
    isOthers: item.isOthers,
    grouped: item.grouped,
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

      {/* BLOCO DO CELULAR (md:hidden) */}
      <div className="md:hidden space-y-4">
        {/* 1. Gráfico de ritmo */}
        <PaceChart pace={pace} from={filters.from} />

        {/* 2. Linha Receitas R$ X · Sobra R$ Y */}
        <div data-testid="mobile-kpi-summary" className="flex items-center justify-between rounded-lg border bg-card p-3.5 text-sm shadow-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-muted-foreground text-xs">Receitas</span>
            <Money cents={kpis.incomeCents} className="font-semibold text-foreground text-sm" />
          </div>
          <span className="text-muted-foreground">·</span>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-muted-foreground text-xs">Sobra</span>
            <Money cents={kpis.netCents} colored className="font-semibold text-sm" />
          </div>
        </div>

        {/* 3. Card de metas (não renderiza nada se considered === 0) */}
        {limitsSummary.considered > 0 && <LimitsSummaryCard summary={limitsSummary} />}

        {/* 4. Link Ver análise completa */}
        <Link
          href={withFilters('/analise', {}, filters)}
          className="flex items-center justify-between rounded-lg border bg-card p-3.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors shadow-xs"
        >
          <span>Ver análise completa</span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>

        {/* 5. Rosca no fim */}
        <BreakdownDonut
          title="Gastos por categoria"
          description="Clique numa categoria para ver as transações."
          mode={roscaMode}
          byCategory={categorySlices}
          byPaymentMethod={pmSlices}
          byCategoryMobile={categorySlicesMobile}
          byPaymentMethodMobile={pmSlicesMobile}
          totalCents={totalCents}
        />
      </div>

      {/* BLOCO DO DESKTOP (hidden md:block) */}
      <div className="hidden md:block space-y-6">
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

        {/* Ritmo e Card de metas */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <PaceChart pace={pace} from={filters.from} />
          </div>
          <div className="xl:col-span-1">
            <LimitsSummaryCard summary={limitsSummary} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BreakdownDonut
            title="Gastos por categoria"
            description="Clique numa categoria para ver as transações."
            mode={roscaMode}
            byCategory={categorySlices}
            byPaymentMethod={pmSlices}
            byCategoryMobile={categorySlicesMobile}
            byPaymentMethodMobile={pmSlicesMobile}
            totalCents={totalCents}
          />
          <PaymentMethodBars
            byPaymentMethod={byPaymentMethod}
            byCategory={byCategory}
            mode={barrasMode}
            totalCents={totalCents}
            filters={filters}
            totalsAccountIds={hasExcluded ? totalsAccountIds : undefined}
            parentIds={catDim === 'category' ? parentCategoryIds(categories) : undefined}
          />
        </div>

        <SectionCard title="Evolução mensal" description="Últimos 6 meses, empilhado por categoria.">
          <MonthlyStacked series={monthly} />
        </SectionCard>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
    </div>
  );
}
