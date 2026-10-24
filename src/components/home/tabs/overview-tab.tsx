import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { getRequestAccountsOverview } from '@/server/queries/request-cache';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories, listTags } from '@/server/queries/catalog';
import { getDashboardKpis } from '@/server/queries/dashboard';
import { getMonthlySeries } from '@/server/queries/monthly';
import { previousPeriodLabel } from '@/server/queries/period-label';
import { categoryDimensionFor, trailingMonthsRange } from '@/server/queries/stats';
import { getSpendingPace } from '@/server/home/pace';
import { getMonthlyLimitsSummary } from '@/server/home/limits-summary';
import { parseFilters, withFilters } from '@/server/queries/url-filters';
import { FilterBar } from '@/components/filters';
import { StatStrip } from '@/components/layout/stat-strip';
import {
  accountsTotals,
  parentCategoryIds,
} from '@/components/charts/links';
import { SectionCard } from '@/components/charts/section-card';
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

  const overview = await getRequestAccountsOverview();
  const [
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
    getDashboardKpis(db, filters, { overview }),
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

  return (
    <div className="space-y-6">
      {/* Filtros completos no desktop */}
      <div className="hidden md:block">
        <FilterBar accounts={overview} categories={categories} tags={tags} />
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
          title={roscaMode === 'forma' ? 'Gastos por forma de pagamento' : 'Gastos por categoria'}
          description="Clique para ver as transações."
          mode={roscaMode}
          byCategory={byCategory}
          byPaymentMethod={byPaymentMethod}
          filters={filters}
          linkOptions={linkOpts}
          totalCents={totalCents}
        />
      </div>

      {/* BLOCO DO DESKTOP (hidden md:block) */}
      <div className="hidden md:block space-y-6">
        <StatStrip
          items={[
            {
              label: 'Gastos',
              value: <Money cents={kpis.expenseCents} />,
              hint:
                kpis.previousExpenseCents !== null
                  ? `${kpis.expenseCents > kpis.previousExpenseCents ? '+' : ''}${Math.round(
                      ((kpis.expenseCents - kpis.previousExpenseCents) /
                        (kpis.previousExpenseCents || 1)) *
                        100,
                    )}% vs ${prevLabel}`
                  : undefined,
              tone: 'flow',
              testId: 'kpi-gastos',
            },
            {
              label: 'Receitas',
              value: <Money cents={kpis.incomeCents} />,
              hint:
                kpis.previousIncomeCents !== null
                  ? `${kpis.incomeCents > kpis.previousIncomeCents ? '+' : ''}${Math.round(
                      ((kpis.incomeCents - kpis.previousIncomeCents) /
                        (kpis.previousIncomeCents || 1)) *
                        100,
                    )}% vs ${prevLabel}`
                  : undefined,
              tone: 'positive',
              testId: 'kpi-receitas',
            },
            {
              label: 'Saldo do período',
              value: <Money cents={kpis.netCents} colored />,
              hint: 'Receitas − gastos',
              tone: kpis.netCents >= 0 ? 'positive' : 'negative',
              testId: 'kpi-saldo-do-periodo',
            },
            {
              label: 'Saldo em contas',
              value: <Money cents={kpis.balanceCents} />,
              hint: `${kpis.institutionCount} ${kpis.institutionCount === 1 ? 'instituição' : 'instituições'} · situação atual`,
              testId: 'kpi-saldo-em-contas',
            },
            {
              label: 'Faturas abertas',
              value: <Money cents={kpis.openInvoicesCents} />,
              hint: `${kpis.cardCount} ${kpis.cardCount === 1 ? 'cartão' : 'cartões'} · situação atual`,
              tone: 'warning',
              testId: 'kpi-faturas-abertas',
            },
            {
              label: 'Parcelas futuras',
              value: <Money cents={kpis.futureInstallmentsCents} />,
              hint: 'Próximos 12 meses · independe do período',
              tone: 'flow',
              testId: 'kpi-parcelas-futuras',
            },
          ]}
        />

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
            title={roscaMode === 'forma' ? 'Gastos por forma de pagamento' : 'Gastos por categoria'}
            description="Clique para ver as transações."
            mode={roscaMode}
            byCategory={byCategory}
            byPaymentMethod={byPaymentMethod}
            filters={filters}
            linkOptions={linkOpts}
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
