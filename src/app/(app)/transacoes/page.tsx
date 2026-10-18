import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transações"
        description="Extrato unificado com busca, filtros e edição de categoria."
      />
      <EmptyState
        title="Em construção"
        description="Esta tela será implementada nas próximas etapas."
      />
    </div>
  );
}
