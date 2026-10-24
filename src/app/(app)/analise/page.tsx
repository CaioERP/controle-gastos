import * as React from 'react';
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
  type AnalysisDim,
} from '@/server/queries/analysis';
import { getBreakdown } from '@/server/queries/breakdown';
import { listCategories, listTags, type CategoryTree } from '@/server/queries/catalog';
import { getCrossTab } from '@/server/queries/crosstab';
import { getMonthlySeries } from '@/server/queries/monthly';
import { previousPeriodLabel } from '@/server/queries/period-label';
import { categoryDimensionFor, percentChange, trailingMonthsRange } from '@/server/queries/stats';
import { getSpendingSummary, previousRange } from '@/server/queries/summary';
import { parseFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';
import { formatMonthBR } from '@/server/domain/dates';
import { FilterBar } from '@/components/filters';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/format/money';
import { formatPercentInt, formatShare } from '@/components/charts/format';
import {
  accountsTotals,
  parentCategoryIds,
  paymentMethodTransactionsHref,
} from '@/components/charts/links';
import { monthlyChartData } from '@/components/charts/monthly-data';
import { paymentMethodColor } from '@/components/charts/palette';
import { Section } from '@/components/layout/section';
import { BreakdownBars } from '@/components/analysis/breakdown-bars';
import { CrosstabTable } from '@/components/analysis/crosstab-table';
import { DimensionSelect } from '@/components/analysis/dimension-select';
import { MerchantRanking } from '@/components/analysis/merchant-ranking';
import { MonthlyEvolution } from '@/components/analysis/monthly-evolution';
import { PeriodComparison } from '@/components/analysis/period-comparison';
import { SectionTabs } from '@/components/analysis/section-tabs';
import { CategoryBreakdownList } from '@/components/analysis/category-breakdown-list';
import { TopChanges } from '@/components/analysis/top-changes';
import { analysisHref, parseAnalysisSection, type AnalysisSection } from '@/components/analysis/links';
import { cn } from '@/lib/utils';

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
  const secao = parseAnalysisSection(params.secao);
  const db = getDb();

  // Dados comuns para filtros e cabeçalho
  const [overview, categories, tags] = await Promise.all([
    getAccountsOverview(db),
    listCategories(db),
    listTags(db),
  ]);

  if (overview.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Análise" description="Gastos por tipo e categoria, matriz, evolução, rankings e comparação." />
        <EmptyState title="Nenhuma conta conectada" description="Conecte um banco para analisar seus gastos." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FilterBar accounts={overview} categories={categories} tags={tags} />
      <PageHeader
        title="Análise"
        description="Gastos por tipo e categoria, matriz, evolução, rankings e comparação."
      />

      <SectionTabs currentSection={secao} filters={filters} dim={dim} />

      <React.Suspense fallback={<AnalysisSectionSkeleton />}>
        <AnalysisSectionContent
          secao={secao}
          filters={filters}
          dim={dim}
          overview={overview}
          categories={categories}
        />
      </React.Suspense>
    </div>
  );
}

function AnalysisSectionSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
        <div className="flex-[7_1_440px] space-y-4">
          <Skeleton className="h-6 w-36" />
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>

        <div className="flex-[5_1_320px] space-y-6">
          <Skeleton className="h-44 rounded-2xl border border-border/40 bg-muted/40" />
          <Skeleton className="h-56 rounded-2xl border border-border/60 bg-card" />
        </div>
      </div>
    </div>
  );
}

async function AnalysisSectionContent({
  secao,
  filters,
  dim,
  overview,
  categories,
}: {
  secao: AnalysisSection;
  filters: TxFilters;
  dim: AnalysisDim;
  overview: Awaited<ReturnType<typeof getAccountsOverview>>;
  categories: CategoryTree[];
}) {
  const db = getDb();
  const drilled = Boolean(filters.categoryIds && filters.categoryIds.length > 0);
  const catDim = drilled ? 'category' : categoryDimensionFor(filters);
  const prev = previousRange(filters.from, filters.to);
  const prevLabel = previousPeriodLabel(filters);

  const { totalsAccountIds, hasExcluded } = accountsTotals(overview);
  const linkOpts = {
    ...(drilled ? { parentIds: parentCategoryIds(categories) } : {}),
    ...(hasExcluded ? { totalsAccountIds } : {}),
  };
  const pmLinkOpts = hasExcluded ? { totalsAccountIds } : undefined;
  const path = filters.categoryIds?.length === 1 ? categoryPath(categories, filters.categoryIds[0]!) : [];

  // Rótulo amigável do período para o resumo
  const isSingleMonth =
    Boolean(filters.from && filters.to && filters.from.slice(0, 7) === filters.to.slice(0, 7));
  const periodLabel = isSingleMonth && filters.from ? formatMonthBR(filters.from) : 'no período';

  // Busca seletiva de dados por seção ativa
  let summary = { expenseCents: 0, incomeCents: 0, netCents: 0 };
  let byPayment: Awaited<ReturnType<typeof getBreakdown>> = [];
  let byCategory: Awaited<ReturnType<typeof getBreakdown>> = [];
  let previousByCategory: Awaited<ReturnType<typeof getBreakdown>> = [];
  let crossTab: Awaited<ReturnType<typeof getCrossTab>> | null = null;
  let pmCrossTab: Awaited<ReturnType<typeof getCrossTab>> | null = null;
  let monthly: Awaited<ReturnType<typeof getMonthlySeries>> | null = null;
  let byMerchant: Awaited<ReturnType<typeof getBreakdown>> = [];

  if (secao === 'categorias') {
    [summary, byCategory, previousByCategory, crossTab, byPayment] = await Promise.all([
      getSpendingSummary(db, filters),
      getBreakdown(db, filters, catDim),
      getBreakdown(db, { ...filters, from: prev.from, to: prev.to }, catDim),
      getCrossTab(db, filters, catDim, 'paymentMethod'),
      getBreakdown(db, filters, 'paymentMethod'),
    ]);
  } else if (secao === 'formas') {
    [summary, byPayment, pmCrossTab] = await Promise.all([
      getSpendingSummary(db, filters),
      getBreakdown(db, filters, 'paymentMethod'),
      getCrossTab(db, filters, 'paymentMethod', catDim),
    ]);
  } else if (secao === 'lojas') {
    byMerchant = await getBreakdown(db, filters, 'merchant');
  } else if (secao === 'evolucao') {
    monthly = await getMonthlySeries(
      db,
      { ...filters, ...trailingMonthsRange(filters, 12) },
      analysisDimToDimension(dim),
      { top: 6 }
    );
  } else if (secao === 'comparar') {
    [byCategory, previousByCategory] = await Promise.all([
      getBreakdown(db, filters, catDim),
      getBreakdown(db, { ...filters, from: prev.from, to: prev.to }, catDim),
    ]);
  }

  const totalCents = summary.expenseCents;
  const heatmap = crossTab ? buildHeatmap(crossTab) : null;
  const pmHeatmap = pmCrossTab ? buildHeatmap(pmCrossTab) : null;
  const evolution = monthly ? monthlyChartData(monthly, dim === 'paymentMethod' ? 'paymentMethod' : 'db') : null;
  const comparison =
    byCategory.length > 0 || previousByCategory.length > 0
      ? comparePeriods(byCategory, previousByCategory)
      : [];

  const prevTotalCents = comparison.reduce((sum, r) => sum + r.previousCents, 0);
  const deltaCents = totalCents - prevTotalCents;
  const isIncrease = deltaCents > 0;
  const changeRatio = percentChange(totalCents, prevTotalCents);
  const changeText =
    changeRatio !== null
      ? formatPercentInt(Math.abs(changeRatio))
      : totalCents > 0
        ? 'novo'
        : '0%';

  const positivePayments = byPayment.filter((p) => p.totalCents > 0);

  return (
    <>
      {secao === 'categorias' && (
        <>
          {drilled && (
            <nav aria-label="Caminho da categoria" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Link
                href={analysisHref(filters, { categoryIds: undefined }, dim, secao)}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Todas
              </Link>
              <ChevronRight className="size-3.5" aria-hidden />
              <span aria-current="page" className="font-medium text-foreground">
                {path.length > 0 ? path.map((c) => c.name).join(' › ') : `${filters.categoryIds!.length} categorias`}
              </span>
            </nav>
          )}

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
            {/* Esquerda (flex: 7): Lista de categorias com barra de formas de pagamento */}
            <section
              aria-label="Gastos por categoria e forma de pagamento"
              className="flex-[7_1_440px] min-w-0"
            >
              <div className="flex items-baseline justify-between gap-2 pb-2">
                <h2 className="text-base font-semibold text-foreground">Por categoria</h2>
                <span className="text-xs text-muted-foreground">
                  barra = formas de pagamento · clique para ver as transações
                </span>
              </div>

              {heatmap ? (
                <CategoryBreakdownList
                  heatmap={heatmap}
                  filters={filters}
                  linkOptions={linkOpts}
                  dim={dim}
                  secao={secao}
                  drilled={drilled}
                />
              ) : null}
            </section>

            {/* Direita (flex: 5): Total do mês + Top mudanças */}
            <div className="flex-[5_1_320px] min-w-0 flex flex-col gap-6">
              {/* Painel de total com barra empilhada de formas */}
              <section
                aria-label="Total do período"
                className="rounded-2xl bg-muted/40 p-5 border border-border/40 space-y-3"
              >
                <div className="text-xs text-muted-foreground">Gastos em {periodLabel}</div>
                <div className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground leading-tight">
                  <Money cents={totalCents} />
                </div>
                {(totalCents > 0 || prevTotalCents > 0) && (
                  <div className="text-xs">
                    <span
                      className={cn(
                        'font-semibold',
                        isIncrease ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {isIncrease ? '▲' : '▼'} {changeText}
                    </span>{' '}
                    <span className="text-muted-foreground">
                      vs {prevLabel} (<Money cents={prevTotalCents} />)
                    </span>
                  </div>
                )}

                {positivePayments.length > 0 && totalCents > 0 && (
                  <div className="pt-2 space-y-3">
                    <div className="h-2.5 rounded-full overflow-hidden bg-muted flex gap-0.5" aria-hidden>
                      {positivePayments.map((pm) => (
                        <span
                          key={pm.key}
                          style={{
                            width: `${(pm.totalCents / totalCents) * 100}%`,
                            backgroundColor: paymentMethodColor(pm.key),
                          }}
                        />
                      ))}
                    </div>

                    <ul className="space-y-1.5 text-xs text-muted-foreground pt-1" aria-label="Valores por forma de pagamento">
                      {positivePayments.map((pm) => (
                        <li key={pm.key} className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-foreground font-medium">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: paymentMethodColor(pm.key) }}
                              aria-hidden
                            />
                            {pm.label}
                          </span>
                          <span className="flex items-baseline gap-2">
                            <Money cents={pm.totalCents} className="text-foreground" />
                            <span className="text-muted-foreground tabular-nums w-10 text-right">
                              {formatShare(pm.totalCents, totalCents)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              {/* O que mais mudou */}
              <TopChanges rows={comparison} previousLabel={prevLabel} filters={filters} />
            </div>
          </div>

          {/* Abaixo da lista, só no desktop (hidden md:block): matriz categoria × forma de pagamento */}
          {heatmap && heatmap.rows.length > 0 && (
            <div id="crosstab-matrix" className="hidden md:block pt-8 border-t border-border/60">
              <Section
                title="Categoria × forma de pagamento"
                description="Intensidade da cor proporcional ao valor. Clique numa célula para ver as transações."
              >
                <CrosstabTable heatmap={heatmap} filters={filters} linkOptions={linkOpts} />
              </Section>
            </div>
          )}
        </>
      )}

      {secao === 'formas' && (
        <div className="space-y-8">
          <Section title="Por forma de pagamento" description="Distribuição dos gastos por modalidade.">
            {byPayment.length > 0 ? (
              <BreakdownBars
                ariaLabel="Gastos por forma de pagamento"
                items={byPayment}
                totalCents={totalCents}
                colorFor={(i) => paymentMethodColor(i.key)}
                hrefFor={(i) => paymentMethodTransactionsHref(filters, i.key, pmLinkOpts)}
              />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem gastos no período.</p>
            )}
          </Section>

          {pmHeatmap && pmHeatmap.rows.length > 0 && (
            <Section
              title="Forma de pagamento × categoria"
              description="Detalhamento das categorias em cada forma de pagamento."
              separated
            >
              <div className="hidden md:block">
                <CrosstabTable heatmap={pmHeatmap} filters={filters} linkOptions={linkOpts} transposed />
              </div>
              <div className="md:hidden">
                <CategoryBreakdownList heatmap={pmHeatmap} filters={filters} linkOptions={linkOpts} transposed />
              </div>
            </Section>
          )}
        </div>
      )}

      {secao === 'lojas' && (
        <Section title="Ranking de estabelecimentos" description="Maiores estabelecimentos do período.">
          <MerchantRanking rows={merchantRanking(byMerchant, 15)} />
        </Section>
      )}

      {secao === 'evolucao' && evolution && (
        <Section title="Evolução mensal" description="Últimos 12 meses até o fim do período.">
          <div className="mb-3">
            <DimensionSelect value={dim} filters={filters} secao="evolucao" />
          </div>
          <MonthlyEvolution points={evolution.points} series={evolution.series} />
        </Section>
      )}

      {secao === 'comparar' && (
        <Section
          title="Comparação com o período anterior"
          description={`Período atual × ${prevLabel}.`}
        >
          <PeriodComparison rows={comparison} previousLabel={prevLabel} />
        </Section>
      )}
    </>
  );
}
