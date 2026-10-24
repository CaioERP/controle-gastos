'use client';

import * as React from 'react';
import { Plus, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { LimitsSummaryCards } from './limits-summary-cards';
import { SuggestedBudgetsBanner } from './suggested-budgets-banner';
import { LimitCard } from './limit-card';
import { SpendingLimitDialog, type AccountOption } from './spending-limit-dialog';
import type { CategoryTree } from '@/server/queries/catalog';
import type { LimitsOverview, SpendingLimitRow } from '@/server/queries/limits';

type LimitsViewProps = {
  overview: LimitsOverview;
  categories: CategoryTree[];
  accounts: AccountOption[];
  suggestionsSlot?: React.ReactNode;
};

type TabFilter = 'all' | 'active' | 'paused';

export function LimitsView({ overview, categories, accounts, suggestionsSlot }: LimitsViewProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingLimit, setEditingLimit] = React.useState<SpendingLimitRow | null>(null);
  const [tab, setTab] = React.useState<TabFilter>('all');

  function handleOpenNew() {
    setEditingLimit(null);
    setDialogOpen(true);
  }

  function handleOpenEdit(limit: SpendingLimitRow) {
    setEditingLimit(limit);
    setDialogOpen(true);
  }

  const activeLimits = overview.limits.filter((l) => l.isActive);
  const pausedLimits = overview.limits.filter((l) => !l.isActive);

  const displayedLimits = React.useMemo(() => {
    if (tab === 'active') return activeLimits;
    if (tab === 'paused') return pausedLimits;
    return overview.limits;
  }, [tab, activeLimits, pausedLimits, overview.limits]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Limites e metas"
        description="Acompanhe e controle seus orçamentos por categoria e forma de pagamento."
        actions={
          <Button onClick={handleOpenNew} className="gap-1.5" data-testid="new-limit-btn">
            <Plus className="h-4 w-4" />
            <span>Nova meta</span>
          </Button>
        }
      />

      {/* Cards de Resumo */}
      <LimitsSummaryCards
        totalBudgetedCents={overview.totalBudgetedCents}
        totalSpentCents={overview.totalSpentCents}
        spentPercent={overview.spentPercent}
        limitsCount={overview.limitsCount}
        warningCount={overview.warningCount}
        exceededCount={overview.exceededCount}
      />

      {/* Banner de Sugestões de Orçamento */}
      {suggestionsSlot ?? <SuggestedBudgetsBanner suggestions={overview.suggestions} />}

      {/* Listagem de Limites */}
      <div className="space-y-4">
        {overview.limits.length > 0 && (
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTab('all')}
                className={`text-xs sm:text-sm font-medium pb-1 transition-colors border-b-2 -mb-2.5 px-1 ${
                  tab === 'all'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Todas ({overview.limits.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('active')}
                className={`text-xs sm:text-sm font-medium pb-1 transition-colors border-b-2 -mb-2.5 px-1 ${
                  tab === 'active'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Ativas ({activeLimits.length})
              </button>
              {pausedLimits.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTab('paused')}
                  className={`text-xs sm:text-sm font-medium pb-1 transition-colors border-b-2 -mb-2.5 px-1 ${
                    tab === 'paused'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Pausadas ({pausedLimits.length})
                </button>
              )}
            </div>
          </div>
        )}

        {displayedLimits.length === 0 ? (
          <EmptyState
            icon={Target}
            title={
              overview.limits.length === 0
                ? 'Nenhuma meta cadastrada'
                : 'Nenhuma meta neste filtro'
            }
            description={
              overview.limits.length === 0
                ? 'Defina limites de gastos por categoria ou forma de pagamento para manter seu orçamento sob controle.'
                : 'Alterne a aba para visualizar outras metas.'
            }
            action={
              overview.limits.length === 0 ? (
                <Button onClick={handleOpenNew} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  <span>Criar primeira meta</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayedLimits.map((limit) => (
              <LimitCard key={limit.id} limit={limit} onEdit={handleOpenEdit} />
            ))}
          </div>
        )}
      </div>

      {/* Diálogo de Criação/Edição */}
      <SpendingLimitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        accounts={accounts}
        limit={editingLimit}
      />
    </div>
  );
}
