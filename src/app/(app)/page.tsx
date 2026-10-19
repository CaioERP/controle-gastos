import Link from 'next/link';
import { PlugZap } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { formatMonthBR, monthEnd } from '@/server/domain/dates';
import type { TxFilters } from '@/server/domain/filters';
import { getAccountsOverview } from '@/server/queries/accounts';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories, listTags } from '@/server/queries/catalog';
import { getDashboardKpis, topWithOthers, trailingMonthsRange } from '@/server/queries/dashboard';
import { getMonthlySeries } from '@/server/queries/monthly';
import { previousRange } from '@/server/queries/summary';
import { getReviewCount } from '@/server/queries/transactions';
import { parseFilters } from '@/server/queries/url-filters';
import { FilterBar } from '@/components/filters';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { categoryTransactionsHref } from '@/components/charts/links';
import { NEUTRAL_COLOR, seriesColor } from '@/components/charts/palette';
import { SectionCard, SectionEmpty } from '@/components/charts/section-card';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { CategoryDonut } from '@/components/dashboard/category-donut';
import { PaymentMethodBars } from '@/components/dashboard/payment-method-bars';
import { MonthlyStacked } from '@/components/dashboard/monthly-stacked';
import { TopMerchants, topMerchants } from '@/components/dashboard/top-merchants';
import { UpcomingInvoices } from '@/components/dashboard/upcoming-invoices';
import { ReviewCallout } from '@/components/dashboard/review-callout';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function previousLabel(f: TxFilters): string {
  const prev = previousRange(f.from, f.to);
  const isFullMonth = prev.from.endsWith('-01') && prev.to === monthEnd(prev.from);
  return isFullMonth ? formatMonthBR(prev.from) : 'período anterior';
}

export default async function DashboardPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const db = getDb();

  const overviewPromise = getAccountsOverview(db);
  const [overview, kpis, categories, tags, byCategory, byPaymentMethod, byMerchant, monthly, reviewCount] =
    await Promise.all([
      overviewPromise,
      overviewPromise.then((o) => getDashboardKpis(db, filters, { overview: o })),
      listCategories(db),
      listTags(db),
      getBreakdown(db, filters, 'parentCategory'),
      getBreakdown(db, filters, 'paymentMethod'),
      getBreakdown(db, filters, 'merchant'),
      getMonthlySeries(db, { ...filters, ...trailingMonthsRange(filters, 6) }, 'parentCategory', { top: 6 }),
      getReviewCount(db),
    ]);

  if (overview.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Visão consolidada dos seus gastos." />
        <EmptyState
          icon={PlugZap}
          title="Conecte seu primeiro banco"
          description="Assim que houver uma conta conectada, seus gastos, saldos e faturas aparecem aqui."
          action={
            <Link href="/conexoes" className={buttonVariants()}>
              Conectar banco
            </Link>
          }
        />
      </div>
    );
  }

  const prevLabel = previousLabel(filters);
  const totalCents = kpis.expenseCents;

  const slices = topWithOthers(byCategory, 7).map((item, i) => ({
    key: item.key,
    label: item.label,
    color: item.isOthers ? NEUTRAL_COLOR : seriesColor(item.color, i),
    totalCents: item.totalCents,
    href: categoryTransactionsHref(filters, item.key),
  }));

  return (
    <div className="space-y-6">
      <FilterBar accounts={overview} categories={categories} tags={tags} />
      <PageHeader title="Dashboard" description="Visão consolidada do período, por categoria e forma de pagamento." />

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
            <PaymentMethodBars items={byPaymentMethod} totalCents={totalCents} filters={filters} />
          ) : (
            <SectionEmpty />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Evolução mensal" description="Últimos 6 meses, empilhado por categoria.">
        <MonthlyStacked series={monthly} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        <ReviewCallout count={reviewCount} />
      </div>
    </div>
  );
}
