import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias e regras"
        description="Gerenciamento hierárquico de categorias e regras aprendidas."
      />
      <EmptyState
        title="Em construção"
        description="Esta tela será implementada nas próximas etapas."
      />
    </div>
  );
}
