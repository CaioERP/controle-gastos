'use client';

import * as React from 'react';
import { Plus, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { RecurrencesSummaryCards } from './recurrences-summary-cards';
import { SubscriptionsTable } from './subscriptions-table';
import { RecurrenceDialog, type AccountOption } from './recurrence-dialog';
import type { CategoryTree } from '@/server/queries/catalog';
import type { RecurrenceRow, SubscriptionsSummary } from '@/server/queries/recurrences';

type RecurrencesViewProps = {
  summary: SubscriptionsSummary;
  categories: CategoryTree[];
  accounts: AccountOption[];
};

export function RecurrencesView({
  summary,
  categories,
  accounts,
}: RecurrencesViewProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<RecurrenceRow | null>(null);

  function handleOpenNew() {
    setEditingItem(null);
    setDialogOpen(true);
  }

  function handleOpenEdit(item: RecurrenceRow) {
    setEditingItem(item);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assinaturas e recorrências"
        description="Acompanhe compromissos fixos mensais e anuais, controle serviços contínuos e identifique aumentos de preço."
        actions={
          <Button onClick={handleOpenNew} className="gap-1.5" data-testid="new-recurrence-btn">
            <Plus className="h-4 w-4" />
            <span>Nova recorrência</span>
          </Button>
        }
      />

      {/* Cards de Resumo */}
      <RecurrencesSummaryCards
        monthlyTotalCents={summary.monthlyTotalCents}
        yearlyTotalCents={summary.yearlyTotalCents}
        activeCount={summary.activeCount}
        priceHikesCount={summary.priceHikesCount}
      />

      {/* Listagem / Tabela */}
      {summary.items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nenhuma assinatura ou recorrência cadastrada"
          description="Cadastre seus pagamentos recorrentes ou aguarde a detecção automática a partir de seus extratos."
          action={
            <Button onClick={handleOpenNew} className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span>Cadastrar primeira assinatura</span>
            </Button>
          }
        />
      ) : (
        <SubscriptionsTable items={summary.items} onEdit={handleOpenEdit} />
      )}

      {/* Diálogo de Cadastro/Edição */}
      <RecurrenceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        accounts={accounts}
        recurrence={editingItem}
      />
    </div>
  );
}
