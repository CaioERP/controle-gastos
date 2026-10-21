'use client';

import * as React from 'react';
import {
  MoreVertical,
  Pencil,
  Pause,
  Play,
  Trash2,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Money } from '@/components/format/money';
import { RECURRENCE_STATUS_LABELS } from '@/server/domain/labels';
import type { RecurrenceRow } from '@/server/queries/recurrences';
import {
  deleteRecurrenceAction,
  toggleRecurrenceStatusAction,
} from '@/app/(app)/assinaturas/actions';
import { cn } from '@/lib/utils';

type SubscriptionsTableProps = {
  items: RecurrenceRow[];
  onEdit: (item: RecurrenceRow) => void;
};

type FilterMode = 'all' | 'subscriptions' | 'active' | 'paused';

export function SubscriptionsTable({ items, onEdit }: SubscriptionsTableProps) {
  const [filter, setFilter] = React.useState<FilterMode>('all');
  const [isPending, startTransition] = React.useTransition();

  const filteredItems = React.useMemo(() => {
    switch (filter) {
      case 'subscriptions':
        return items.filter((i) => i.isSubscription);
      case 'active':
        return items.filter((i) => i.status === 'active');
      case 'paused':
        return items.filter((i) => i.status === 'paused');
      case 'all':
      default:
        return items;
    }
  }, [items, filter]);

  function handleToggleStatus(item: RecurrenceRow) {
    const nextStatus = item.status === 'active' ? 'paused' : 'active';
    startTransition(async () => {
      try {
        const res = await toggleRecurrenceStatusAction({
          recurrenceId: item.id,
          status: nextStatus,
        });
        if (res.ok) {
          toast.success(
            nextStatus === 'paused'
              ? `Assinatura "${item.description}" pausada`
              : `Assinatura "${item.description}" reativada`,
          );
        } else {
          toast.error(res.error.message || 'Erro ao alterar status');
        }
      } catch {
        toast.error('Erro de conexão ao alterar status');
      }
    });
  }

  function handleDelete(item: RecurrenceRow) {
    if (!window.confirm(`Deseja remover a recorrência "${item.description}"?`)) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await deleteRecurrenceAction({ recurrenceId: item.id });
        if (res.ok) {
          toast.success('Recorrência removida');
        } else {
          toast.error(res.error.message || 'Erro ao remover recorrência');
        }
      } catch {
        toast.error('Erro de conexão ao remover recorrência');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Filtros em Abas */}
      <div className="flex items-center justify-between border-b pb-2 overflow-x-auto">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`text-xs sm:text-sm font-medium pb-2 transition-colors border-b-2 -mb-2.5 px-1 ${
              filter === 'all'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Todas ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('subscriptions')}
            className={`text-xs sm:text-sm font-medium pb-2 transition-colors border-b-2 -mb-2.5 px-1 ${
              filter === 'subscriptions'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Apenas Assinaturas ({items.filter((i) => i.isSubscription).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`text-xs sm:text-sm font-medium pb-2 transition-colors border-b-2 -mb-2.5 px-1 ${
              filter === 'active'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Ativas ({items.filter((i) => i.status === 'active').length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('paused')}
            className={`text-xs sm:text-sm font-medium pb-2 transition-colors border-b-2 -mb-2.5 px-1 ${
              filter === 'paused'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Pausadas ({items.filter((i) => i.status === 'paused').length})
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <p className="text-sm">Nenhuma recorrência encontrada neste filtro.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-2xs">
          <table className="w-full text-left text-sm" data-testid="subscriptions-table">
            <thead className="bg-muted/40 text-xs font-medium text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3">Serviço / Estabelecimento</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 hidden md:table-cell">Forma de Pagamento</th>
                <th className="px-4 py-3 hidden sm:table-cell">Frequência</th>
                <th className="px-4 py-3 hidden sm:table-cell">Dia Previsto</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredItems.map((item) => {
                const hikeAmount = item.lastAmountCents - item.amountCents;

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      'hover:bg-muted/30 transition-colors',
                      item.status === 'paused' && 'opacity-60 bg-muted/10',
                    )}
                  >
                    {/* Serviço */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">
                              {item.description}
                            </span>
                            {item.isSubscription && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-medium text-primary">
                                Assinatura
                              </span>
                            )}
                            {item.autoDetected && (
                              <span
                                title="Detectada automaticamente pelo histórico de transações"
                                className="text-muted-foreground"
                              >
                                <Sparkles className="h-3 w-3 inline text-primary/60" />
                              </span>
                            )}
                          </div>
                          {item.merchantName && item.merchantName !== item.description && (
                            <span className="text-xs text-muted-foreground block truncate">
                              {item.merchantName}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Categoria */}
                    <td className="px-4 py-3.5">
                      {item.categoryName ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.categoryColor || '#6b7280' }}
                          />
                          <span className="truncate max-w-[120px]">{item.categoryName}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Forma de Pagamento */}
                    <td className="px-4 py-3.5 hidden md:table-cell text-xs text-muted-foreground">
                      {item.paymentMethodLabel || '—'}
                    </td>

                    {/* Frequência */}
                    <td className="px-4 py-3.5 hidden sm:table-cell text-xs text-muted-foreground">
                      {item.frequencyLabel}
                    </td>

                    {/* Dia Previsto */}
                    <td className="px-4 py-3.5 hidden sm:table-cell text-xs text-muted-foreground">
                      {item.expectedDay ? `Dia ${item.expectedDay}` : '—'}
                    </td>

                    {/* Valor e Badge de Aumento */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex flex-col items-end">
                        <Money
                          cents={item.hasPriceHike ? item.lastAmountCents : item.amountCents}
                          className="font-semibold text-sm"
                        />
                        {item.frequency !== 'monthly' && (
                          <span className="text-[11px] text-muted-foreground">
                            (~<Money cents={item.monthlyAmountCents} />/mês)
                          </span>
                        )}
                        {item.hasPriceHike && hikeAmount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5"
                            title={`Valor anterior: ${item.amountCents}`}
                          >
                            <TrendingUp className="h-2.5 w-2.5 shrink-0" />
                            <span>Subiu +<Money cents={hikeAmount} /></span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={cn(
                          'inline-block rounded-md px-2 py-0.5 text-[11px] font-medium capitalize',
                          item.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : item.status === 'paused'
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {RECURRENCE_STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              disabled={isPending}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => onEdit(item)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(item)}>
                            {item.status === 'active' ? (
                              <>
                                <Pause className="mr-2 h-3.5 w-3.5" />
                                Pausar
                              </>
                            ) : (
                              <>
                                <Play className="mr-2 h-3.5 w-3.5" />
                                Reativar
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(item)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
