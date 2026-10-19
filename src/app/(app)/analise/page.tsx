import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { getAccountsOverview } from '@/server/queries/accounts';
import {
  analysisDimToDimension,
  buildHeatmap,
  comparePeriods,
  merchantRanking,
  parseAnalysisDim,
} from '@/server/queries/analysis';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories, listTags, type CategoryTree } from '@/server/queries/catalog';
import { getCrossTab } from '@/server/queries/crosstab';
import { getMonthlySeries } from '@/server/queries/monthly';
import { previousPeriodLabel } from '@/server/queries/period-label';
import { categoryDimensionFor, trailingMonthsRange } from '@/server/queries/stats';
import { getSpendingSummary, previousRange } from '@/server/queries/summary';
import { parseFilters } from '@/server/queries/url-filters';
import { FilterBar } from '@/components/filters';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import {
  categoryTransactionsHref,
  isFilterableId,
  parentCategoryIds,
  paymentMethodTransactionsHref,
} from '@/components/charts/links';
import { monthlyChartData } from '@/components/charts/monthly-data';
import { paymentMethodColor, seriesColor } from '@/components/charts/palette';
import { SectionCard, SectionEmpty } from '@/components/charts/section-card';
import { BreakdownBars } from '@/components/analysis/breakdown-bars';
import { CrosstabTable } from '@/components/analysis/crosstab-table';
import { DimensionSelect } from '@/components/analysis/dimension-select';
import { MerchantRanking } from '@/components/analysis/merchant-ranking';
import { MonthlyEvolution } from '@/components/analysis/monthly-evolution';
import { PeriodComparison } from '@/components/analysis/period-comparison';
import { analysisHref } from '@/components/analysis/links';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Caminho do drill-down: categoria (e pai, se for subcategoria) a partir do id em `cat`. */
function categoryPath(tree: CategoryTree[], id: string): CategoryTree[] {
  for (const parent of tree) {
    if (parent.id === id) return [parent];
    const child = parent.children.find((c) => c.id === id);
    if (child) return [parent, child];
  }
  return [];
}

export default async function AnalisePage({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const dim = parseAnalysisDim(params.dim);
  // Com `cat` na URL, todas as quebras por categoria (barras, matriz, comparação) usam a categoria
  // exata, para que nenhum link amplie o filtro além do valor clicado.
  const catDim = categoryDimensionFor(filters);
  const drilled = catDim === 'category';
  const prev = previousRange(filters.from, filters.to);
  const db = getDb();

  const [overview, categories, tags, summary, byPayment, byCategory, crossTab, monthly, byMerchant, previousByCategory] =
    await Promise.all([
      getAccountsOverview(db),
      listCategories(db),
      listTags(db),
      getSpendingSummary(db, filters),
      getBreakdown(db, filters, 'paymentMethod'),
      getBreakdown(db, filters, catDim),
      getCrossTab(db, filters, catDim, 'paymentMethod'),
      getMonthlySeries(db, { ...filters, ...trailingMonthsRange(filters, 12) }, analysisDimToDimension(dim), { top: 6 }),
      getBreakdown(db, filters, 'merchant'),
      getBreakdown(db, { ...filters, from: prev.from, to: prev.to }, catDim),
    ]);

  const totalCents = summary.expenseCents;
  const heatmap = buildHeatmap(crossTab);
  const evolution = monthlyChartData(monthly, dim === 'paymentMethod' ? 'paymentMethod' : 'db');
  const comparison = comparePeriods(byCategory, previousByCategory);
  const prevLabel = previousPeriodLabel(filters);
  const path = filters.categoryIds?.length === 1 ? categoryPath(categories, filters.categoryIds[0]!) : [];
  const linkOpts = drilled ? { parentIds: parentCategoryIds(categories) } : {};

  return (
    <div className="space-y-6">
      <FilterBar accounts={overview} categories={categories} tags={tags} />
      <PageHeader title="Análise" description="Gastos por tipo e categoria, matriz, evolução, rankings e comparação." />

      {overview.length === 0 ? (
        <EmptyState title="Nenhuma conta conectada" description="Conecte um banco para analisar seus gastos." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Por forma de pagamento">
              {byPayment.length > 0 ? (
                <BreakdownBars
                  ariaLabel="Gastos por forma de pagamento"
                  items={byPayment}
                  totalCents={totalCents}
                  colorFor={(i) => paymentMethodColor(i.key)}
                  hrefFor={(i) => paymentMethodTransactionsHref(filters, i.key)}
                />
              ) : (
                <SectionEmpty />
              )}
            </SectionCard>

            <SectionCard
              title="Por categoria"
              description={
                <nav aria-label="Caminho da categoria" className="flex flex-wrap items-center gap-1">
                  {drilled ? (
                    <Link
                      href={analysisHref(filters, { categoryIds: undefined }, dim)}
                      className="underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Todas
                    </Link>
                  ) : (
                    <span aria-current="page">Todas</span>
                  )}
                  {drilled ? (
                    <>
                      <ChevronRight className="size-3.5" aria-hidden />
                      <span aria-current="page" className="font-medium text-foreground">
                        {path.length > 0
                          ? path.map((c) => c.name).join(' › ')
                          : `${filters.categoryIds!.length} categorias`}
                      </span>
                    </>
                  ) : null}
                </nav>
              }
            >
              {byCategory.length > 0 ? (
                <BreakdownBars
                  ariaLabel="Gastos por categoria"
                  items={byCategory}
                  totalCents={totalCents}
                  colorFor={(i, idx) => seriesColor(i.color, idx)}
                  hrefFor={(i) =>
                    // Sem drill-down: clique abre as subcategorias; já detalhado: abre as transações.
                    !isFilterableId(i.key)
                      ? null
                      : drilled
                        ? categoryTransactionsHref(filters, i.key, linkOpts)
                        : analysisHref(filters, { categoryIds: [i.key] }, dim)
                  }
                />
              ) : (
                <SectionEmpty />
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Categoria × forma de pagamento"
            description="Intensidade da cor proporcional ao valor. Clique numa célula para ver as transações."
          >
            {heatmap.rows.length > 0 ? <CrosstabTable heatmap={heatmap} filters={filters} linkOptions={linkOpts} /> : <SectionEmpty />}
          </SectionCard>

          <SectionCard
            title="Evolução mensal"
            description="Últimos 12 meses até o fim do período."
          >
            <div className="mb-3">
              <DimensionSelect value={dim} filters={filters} />
            </div>
            <MonthlyEvolution points={evolution.points} series={evolution.series} />
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Ranking de estabelecimentos" description="Top 15 do período.">
              <MerchantRanking rows={merchantRanking(byMerchant, 15)} />
            </SectionCard>
            <SectionCard title="Comparação com o período anterior" description={`Período atual × ${prevLabel}.`}>
              <PeriodComparison rows={comparison} previousLabel={prevLabel} />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
