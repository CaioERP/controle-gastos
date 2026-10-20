import { getDb } from '@/server/db/client';
import { getInvestmentsOverview } from '@/server/queries/investments';
import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/format/money';
import { InvestmentsSummaryCards } from '@/components/investments/investments-summary-cards';
import { AllocationDonutChart } from '@/components/investments/allocation-donut-chart';
import { PerformanceComparisonChart } from '@/components/investments/performance-comparison-chart';
import { HoldingsTable } from '@/components/investments/holdings-table';
import { RefreshPricesButton } from '@/components/investments/refresh-prices-button';

export const dynamic = 'force-dynamic';

export default async function InvestimentosPage() {
  const db = getDb();
  const overview = await getInvestmentsOverview(db);

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
          />
        </TabsContent>

        <TabsContent value="proventos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Histórico de proventos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 p-4">
                <span className="text-xs font-medium text-muted-foreground">
                  Total de proventos (últimos 12 meses)
                </span>
                <Money cents={overview.totals.income12mCents} className="text-2xl font-bold" />
                <span className="text-xs text-muted-foreground">
                  Dividendos, JCP e rendimentos recebidos
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                O gerenciamento e lançamento detalhado de proventos mensais e movimentações será concluído na aba de proventos.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
