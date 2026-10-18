'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreVerticalIcon, ArrowUpRightIcon, EyeOffIcon, EyeIcon, AlertCircleIcon, CreditCardIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Money } from '@/components/format/money';
import { LimitBar } from './limit-bar';
import { RenameDialog } from './rename-dialog';
import { CycleDialog } from './cycle-dialog';
import { updateAccountAction } from '@/app/(app)/contas/actions';
import { INVOICE_STATUS_LABELS } from '@/server/domain/labels';
import { formatDateBR } from '@/server/domain/dates';
import type { InstitutionWithAccounts } from '@/server/queries/accounts';

type CardAccountRowProps = {
  account: InstitutionWithAccounts['accounts'][number];
};

export function CardAccountRow({ account }: CardAccountRowProps) {
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [cycleOpen, setCycleOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const credit = account.credit;
  const hasCycle = credit && credit.closingDay !== null && credit.dueDay !== null;

  const handleToggleIncludeInTotals = (checked: boolean) => {
    startTransition(async () => {
      const res = await updateAccountAction({
        accountId: account.id,
        patch: { includeInTotals: checked },
      });
      if (res.ok) {
        toast.success(checked ? 'Cartão incluído nos totais' : 'Cartão removido dos totais');
      } else {
        toast.error(res.error.message);
      }
    });
  };

  const handleToggleHidden = () => {
    const nextHidden = !account.isHidden;
    startTransition(async () => {
      const res = await updateAccountAction({
        accountId: account.id,
        patch: { isHidden: nextHidden },
      });
      if (res.ok) {
        toast.success(nextHidden ? 'Cartão ocultado' : 'Cartão visível');
      } else {
        toast.error(res.error.message);
      }
    });
  };

  return (
    <div className="flex flex-col p-4 rounded-lg border bg-card gap-3.5 hover:border-foreground/20 transition-colors shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm text-foreground">
              {account.displayName ?? account.name}
            </span>
            {account.displayName && (
              <span className="text-[11px] text-muted-foreground">({account.name})</span>
            )}
            {account.isHidden && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                Oculta
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {account.cards.map((c) => (
              <Badge
                key={c.id}
                variant="outline"
                className="text-[10px] font-normal py-0 px-1.5 text-muted-foreground bg-muted/40"
              >
                •{c.last4} {c.isVirtual ? 'virtual' : 'físico'}
                {c.isAdditional ? ' (adicional)' : ''}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          {credit?.openInvoice && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Fatura aberta</div>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                <Money cents={credit.openInvoice.totalCents} />
              </div>
              <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                <span>Vence {formatDateBR(credit.openInvoice.dueDate)}</span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                  {INVOICE_STATUS_LABELS[credit.openInvoice.status]}
                </Badge>
              </div>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label={`Opções do cartão ${account.displayName ?? account.name}`}
                >
                  <MoreVerticalIcon className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setCycleOpen(true)}>
                Configurar ciclo
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                Renomear
              </DropdownMenuItem>

              <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                <span className="text-muted-foreground">Incluir nos totais</span>
                <Switch
                  checked={account.includeInTotals}
                  onCheckedChange={handleToggleIncludeInTotals}
                  disabled={isPending}
                  size="sm"
                />
              </div>

              <DropdownMenuItem onClick={handleToggleHidden} disabled={isPending}>
                {account.isHidden ? (
                  <>
                    <EyeIcon className="mr-2 h-3.5 w-3.5" />
                    <span>Mostrar cartão</span>
                  </>
                ) : (
                  <>
                    <EyeOffIcon className="mr-2 h-3.5 w-3.5" />
                    <span>Ocultar cartão</span>
                  </>
                )}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                render={
                  <Link href={`/transacoes?contas=${account.id}`} className="flex items-center">
                    <ArrowUpRightIcon className="mr-2 h-3.5 w-3.5" />
                    <span>Ver transações</span>
                  </Link>
                }
              />

              <DropdownMenuItem
                render={
                  <Link href={`/faturas?cartao=${account.id}`} className="flex items-center">
                    <ArrowUpRightIcon className="mr-2 h-3.5 w-3.5" />
                    <span>Ver faturas</span>
                  </Link>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {credit && (
        <LimitBar
          limitCents={credit.limitCents}
          availableCents={credit.availableCents}
        />
      )}

      {hasCycle ? (
        <div className="text-[11px] text-muted-foreground">
          Fecha dia {credit.closingDay} · Vence dia {credit.dueDay}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            <span>Configure o fechamento e o vencimento para organizar as faturas</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCycleOpen(true)}
            className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/20 self-start sm:self-auto"
          >
            Configurar ciclo
          </Button>
        </div>
      )}

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        accountId={account.id}
        originalName={account.name}
        currentDisplayName={account.displayName}
      />

      <CycleDialog
        open={cycleOpen}
        onOpenChange={setCycleOpen}
        accountId={account.id}
        accountName={account.displayName ?? account.name}
        initialClosingDay={credit?.closingDay ?? null}
        initialDueDay={credit?.dueDay ?? null}
      />
    </div>
  );
}
