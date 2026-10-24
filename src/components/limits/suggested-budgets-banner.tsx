'use client';

import * as React from 'react';
import { Sparkles, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [expanded, setExpanded] = React.useState(false);
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
      className="rounded-xl border border-border/60 bg-muted/40 p-3 sm:p-4 text-sm text-foreground transition-all"
    >
      {/* Linha recolhida (padrão) */}
      {!expanded ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="font-medium text-xs sm:text-sm truncate">
              {unbudgeted.length} {unbudgeted.length === 1 ? 'sugestão de orçamento' : 'sugestões de orçamento'}
            </span>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs font-semibold text-foreground underline underline-offset-4 hover:text-muted-foreground flex items-center gap-0.5 cursor-pointer"
            >
              Ver
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setDismissed(true)}
            title="Dispensar sugestões"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Fechar</span>
          </Button>
        </div>
      ) : (
        /* Versão expandida */
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Sugestões inteligentes de orçamento</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 flex items-center gap-0.5 mr-2 cursor-pointer"
              >
                Recolher
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => setDismissed(true)}
                title="Dispensar sugestões"
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Fechar</span>
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Com base na média dos últimos 3 meses, sugerimos metas mensais para categorias frequentes:
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {unbudgeted.map((s) => {
              const isPending = pendingCategoryId === s.categoryId;
              return (
                <div
                  key={s.categoryId}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-1.5 shadow-none"
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
                    className="h-7 px-2 text-xs font-medium"
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
      )}
    </div>
  );
}
