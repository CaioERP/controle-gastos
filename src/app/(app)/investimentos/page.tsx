import { getDb } from '@/server/db/client';
import { getDividendsOverview, getInvestmentsOverview } from '@/server/queries/investments';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvestmentsSummaryCards } from '@/components/investments/investments-summary-cards';
import { AllocationDonutChart } from '@/components/investments/allocation-donut-chart';
import { PerformanceComparisonChart } from '@/components/investments/performance-comparison-chart';
import { HoldingsTable } from '@/components/investments/holdings-table';
import { DividendsSection } from '@/components/investments/dividends-section';
import { RefreshPricesButton } from '@/components/investments/refresh-prices-button';

export const dynamic = 'force-dynamic';

export default async function InvestimentosPage() {
  const db = getDb();
  const [overview, dividends] = await Promise.all([
    getInvestmentsOverview(db),
    getDividendsOverview(db),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investimentos"
        description="Acompanhe suas posições de renda fixa, ações, fundos imobiliários, Tesouro Direto e cripto."
        actions={<RefreshPricesButton />}
      />

      <Tabs defaultValue="carteira" className="space-y-6">
        <TabsList>
          <TabsTrigger value="carteira">Carteira</TabsTrigger>
          <TabsTrigger value="proventos">Proventos</TabsTrigger>
        </TabsList>

        <TabsContent value="carteira" className="space-y-6">
          {/* Cards de resumo de topo */}
          <InvestmentsSummaryCards totals={overview.totals} />

          {/* Gráficos de alocação e comparação */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AllocationDonutChart
              allocation={overview.allocation}
              totalCents={overview.totals.currentValueCents}
            />
            <PerformanceComparisonChart series={overview.performanceSeries} />
          </div>

          {/* Tabela detalhada de posições */}
          <HoldingsTable
            holdings={overview.holdings}
            institutions={overview.institutions}
            investmentAccounts={overview.investmentAccounts}
          />
        </TabsContent>

        <TabsContent value="proventos" className="space-y-6">
          <DividendsSection overview={dividends} holdings={overview.holdings} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

