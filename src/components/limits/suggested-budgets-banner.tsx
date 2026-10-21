'use client';

import * as React from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/format/money';
import type { SuggestedBudgetRow } from '@/server/queries/limits';
import { acceptSuggestedBudgetAction } from '@/app/(app)/limites/actions';

type SuggestedBudgetsBannerProps = {
  suggestions: SuggestedBudgetRow[];
};

export function SuggestedBudgetsBanner({ suggestions }: SuggestedBudgetsBannerProps) {
  // Mostra sugestões de categorias que ainda não possuem limite ativo
  const unbudgeted = suggestions.filter((s) => s.currentLimitCents === null);
  const [dismissed, setDismissed] = React.useState(false);
  const [pendingCategoryId, setPendingCategoryId] = React.useState<string | null>(null);

  if (dismissed || unbudgeted.length === 0) {
    return null;
  }

  async function handleAccept(s: SuggestedBudgetRow) {
    setPendingCategoryId(s.categoryId);
    try {
      const res = await acceptSuggestedBudgetAction({
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        amountCents: s.suggestedCents,
      });

      if (res.ok) {
        toast.success(`Meta criada para ${s.categoryName}!`);
      } else {
        toast.error(res.error.message || 'Erro ao criar limite sugerido');
      }
    } catch {
      toast.error('Erro de conexão ao criar limite');
    } finally {
      setPendingCategoryId(null);
    }
  }

  return (
    <div
      data-testid="suggested-budgets-banner"
      className="relative rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-medium text-primary">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span>Sugestões inteligentes de orçamento</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
          title="Dispensar sugestões"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Fechar</span>
        </Button>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Com base na média dos últimos 3 meses, sugerimos metas mensais para categorias frequentes:
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {unbudgeted.map((s) => {
          const isPending = pendingCategoryId === s.categoryId;
          return (
            <div
              key={s.categoryId}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 shadow-xs"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.categoryColor || '#6b7280' }}
              />
              <span className="font-medium text-xs sm:text-sm">{s.categoryName}</span>
              <Money cents={s.suggestedCents} className="text-xs text-muted-foreground" />
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => handleAccept(s)}
                className="h-7 px-2 text-xs font-medium hover:bg-primary hover:text-primary-foreground"
              >
                {isPending ? (
                  <span className="text-xs">Criando...</span>
                ) : (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Aceitar
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
