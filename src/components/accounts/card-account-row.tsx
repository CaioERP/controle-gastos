'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRightIcon, EyeIcon, EyeOffIcon, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  account: InstitutionWithAccounts['accounts'][number] & {
    institutionColor?: string;
    institutionName?: string;
  };
  institution?: {
    name: string;
    color: string;
  };
};

export function CardAccountRow({ account, institution }: CardAccountRowProps) {
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [cycleOpen, setCycleOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const credit = account.credit;
  const hasCycle = credit && credit.closingDay !== null && credit.dueDay !== null;
  const instName = institution?.name ?? account.institutionName ?? '';
  const instColor = institution?.color ?? account.institutionColor ?? '#71717a';

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
    <div className="py-3 border-b border-border/40 last:border-b-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: instColor }}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex flex-wrap items-baseline gap-1.5 min-w-0">
              <span className="font-medium text-sm text-foreground truncate">
                {account.displayName ?? account.name}
              </span>
              {account.displayName && (
                <span className="text-xs text-muted-foreground truncate">({account.name})</span>
              )}
              {account.cards.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {account.cards.map((c) => `•${c.last4}${c.isVirtual ? ' virtual' : ''}`).join(' · ')}
                </span>
              )}
              {account.isHidden && (
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                  Oculta
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {instName ? `${instName} · ` : ''}
              {hasCycle ? (
                <>
                  fecha dia {credit.closingDay} · vence{' '}
                  {credit.openInvoice ? formatDateBR(credit.openInvoice.dueDate).slice(0, 5) : `dia ${credit.dueDay}`}
                </>
              ) : (
                'ciclo não configurado'
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {credit?.openInvoice && (
            <div className="flex items-center gap-2 text-right">
              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                {INVOICE_STATUS_LABELS[credit.openInvoice.status]}
              </span>
              <div className="text-sm font-semibold tabular-nums text-foreground">
                <Money cents={credit.openInvoice.totalCents} />
              </div>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  aria-label={`Opções do cartão ${account.displayName ?? account.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setCycleOpen(true)}>Configurar ciclo</DropdownMenuItem>

              <DropdownMenuItem onClick={() => setRenameOpen(true)}>Renomear</DropdownMenuItem>

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

          <RenameDialog
            open={renameOpen}
            onOpenChange={setRenameOpen}
            accountId={account.id}
            originalName={account.name}
            currentDisplayName={account.displayName}
          />

          {credit && (
            <CycleDialog
              open={cycleOpen}
              onOpenChange={setCycleOpen}
              accountId={account.id}
              accountName={account.displayName ?? account.name}
              initialClosingDay={credit.closingDay}
              initialDueDay={credit.dueDay}
            />
          )}
        </div>
      </div>

      {/* Barra fina de limite */}
      <div className="pl-5.5 pr-10">
        <LimitBar
          limitCents={credit?.limitCents ?? null}
          availableCents={credit?.availableCents ?? null}
        />
      </div>
    </div>
  );
}
