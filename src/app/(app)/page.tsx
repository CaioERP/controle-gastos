import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Visão consolidada do mês, despesas por categoria e evolução."
      />
      <EmptyState
        title="Em construção"
        description="Esta tela será implementada nas próximas etapas."
      />
    </div>
  );
}
