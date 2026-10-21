'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  MoreVertical,
  Pencil,
  Pause,
  Play,
  Trash2,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Money } from '@/components/format/money';
import { LIMIT_PERIOD_LABELS } from '@/server/domain/labels';
import type { SpendingLimitRow } from '@/server/queries/limits';
import {
  deleteSpendingLimitAction,
  toggleSpendingLimitActiveAction,
} from '@/app/(app)/limites/actions';
import { cn } from '@/lib/utils';

type LimitCardProps = {
  limit: SpendingLimitRow;
  onEdit: (limit: SpendingLimitRow) => void;
};

export function LimitCard({ limit, onEdit }: LimitCardProps) {
  const [isPending, startTransition] = React.useTransition();

  const progressBarColor =
    limit.status === 'exceeded'
      ? 'bg-rose-500'
      : limit.status === 'warning'
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  const percentTextColor =
    limit.status === 'exceeded'
      ? 'text-rose-600 dark:text-rose-400'
      : limit.status === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  function handleToggleActive() {
    startTransition(async () => {
      try {
        const res = await toggleSpendingLimitActiveAction({
          limitId: limit.id,
          isActive: !limit.isActive,
        });
        if (res.ok) {
          toast.success(limit.isActive ? 'Meta pausada' : 'Meta reativada');
        } else {
          toast.error(res.error.message || 'Erro ao alterar meta');
        }
      } catch {
        toast.error('Erro de conexão ao alterar meta');
      }
    });
  }

  function handleDelete() {
    if (!window.confirm(`Deseja excluir a meta "${limit.name}"?`)) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await deleteSpendingLimitAction({ limitId: limit.id });
        if (res.ok) {
          toast.success('Meta excluída');
        } else {
          toast.error(res.error.message || 'Erro ao excluir meta');
        }
      } catch {
        toast.error('Erro de conexão ao excluir meta');
      }
    });
  }

  return (
    <Card
      data-testid={`limit-card-${limit.id}`}
      className={cn(
        'relative overflow-hidden transition-all',
        !limit.isActive && 'opacity-60 bg-muted/30 border-dashed',
      )}
    >
      <CardContent className="p-4 sm:p-5 space-y-3">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-base text-foreground truncate">
                {limit.name}
              </span>
              {!limit.isActive && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                  Pausado
                </span>
              )}
            </div>

            {/* Badges de categoria, forma de pagamento, conta e período */}
            <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
              {limit.categoryName && (
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-medium text-secondary-foreground text-xs">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: limit.categoryColor || '#6b7280' }}
                  />
                  {limit.categoryName}
                </span>
              )}
              {limit.paymentMethodLabel && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  {limit.paymentMethodLabel}
                </span>
              )}
              {limit.accountName && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs truncate max-w-[140px]">
                  {limit.accountName}
                </span>
              )}
              <span className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {LIMIT_PERIOD_LABELS[limit.period] || limit.period}
              </span>
            </div>
          </div>

          {/* Menu de ações */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Ações do limite"
                  disabled={isPending}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit(limit)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleActive}>
                {limit.isActive ? (
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
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Valores e Percentual */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground text-base">
                <Money cents={limit.spentCents} />
              </span>{' '}
              de <Money cents={limit.amountCents} />
            </div>
            <span className={cn('text-sm font-bold tabular-nums', percentTextColor)}>
              {limit.spentPercent}%
            </span>
          </div>

          {/* Barra de Progresso */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full transition-all duration-300', progressBarColor)}
              style={{ width: `${Math.min(100, Math.max(0, limit.spentPercent))}%` }}
            />
          </div>
        </div>

        {/* Alerta de Ritmo */}
        {limit.isActive &&
          limit.paceStatus === 'accelerated' &&
          limit.projectedExceedDays !== null && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span>
                No ritmo atual, ultrapassará em {limit.projectedExceedDays}{' '}
                {limit.projectedExceedDays === 1 ? 'dia' : 'dias'}
              </span>
            </div>
          )}

        {/* Rodapé: Link para transações */}
        <div className="pt-1 flex items-center justify-between border-t border-border/40 text-xs">
          <span className="text-muted-foreground text-[11px]">
            Período: {limit.periodFrom} a {limit.periodTo}
          </span>
          <Link
            href={limit.actionUrl}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'h-7 px-2 text-xs font-medium text-primary hover:text-primary gap-1',
            )}
          >
            <span>Ver transações</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
