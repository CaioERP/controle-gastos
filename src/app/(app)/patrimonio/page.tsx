import { getDb } from '@/server/db/client';
import { getNetWorthOverview } from '@/server/queries/net-worth';
import { PageHeader } from '@/components/layout/page-header';
import { NetWorthSummaryCards } from '@/components/net-worth/net-worth-summary-cards';
import { NetWorthEvolutionChart } from '@/components/net-worth/net-worth-evolution-chart';
import { NetWorthDecomposition } from '@/components/net-worth/net-worth-decomposition';
import { SnapshotButton } from '@/components/net-worth/snapshot-button';

export const dynamic = 'force-dynamic';

export default async function PatrimonioPage() {
  const db = getDb();
  const overview = await getNetWorthOverview(db);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patrimônio líquido"
        description="Visão completa de saldos, investimentos, faturas abertas e parcelas futuras."
        actions={<SnapshotButton />}
      />

      {/* Cards de resumo */}
      <NetWorthSummaryCards current={overview.current} changes={overview.changes} />

      {/* Gráfico de evolução mensal */}
      <NetWorthEvolutionChart series={overview.monthlySeries} />

      {/* Decomposição de Ativos vs Passivos e por Instituição */}
      <NetWorthDecomposition
        current={overview.current}
        byInstitution={overview.byInstitution}
      />
    </div>
  );
}
