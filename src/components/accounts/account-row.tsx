'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreVerticalIcon, ArrowUpRightIcon, EyeOffIcon, EyeIcon } from 'lucide-react';
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
import { RenameDialog } from './rename-dialog';
import { updateAccountAction } from '@/app/(app)/contas/actions';
import { ACCOUNT_TYPE_LABELS } from '@/server/domain/labels';
import type { InstitutionWithAccounts } from '@/server/queries/accounts';
import { formatDistanceToNow, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type AccountRowProps = {
  account: InstitutionWithAccounts['accounts'][number];
};

export function AccountRow({ account }: AccountRowProps) {
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const handleToggleIncludeInTotals = (checked: boolean) => {
    startTransition(async () => {
      const res = await updateAccountAction({
        accountId: account.id,
        patch: { includeInTotals: checked },
      });
      if (res.ok) {
        toast.success(checked ? 'Conta incluída nos totais' : 'Conta removida dos totais');
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
        toast.success(nextHidden ? 'Conta ocultada' : 'Conta visível');
      } else {
        toast.error(res.error.message);
      }
    });
  };

  const timeAgo = account.balanceUpdatedAt && isValid(new Date(account.balanceUpdatedAt))
    ? formatDistanceToNow(new Date(account.balanceUpdatedAt), { addSuffix: true, locale: ptBR })
    : null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border bg-card gap-3 hover:border-foreground/20 transition-colors shadow-2xs">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{ACCOUNT_TYPE_LABELS[account.type]}</span>
          {timeAgo && <span>· atualizado {timeAgo}</span>}
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4">
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">
            <Money cents={account.balanceCents} />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label={`Opções da conta ${account.displayName ?? account.name}`}
              >
                <MoreVerticalIcon className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-52">
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
                  <span>Mostrar conta</span>
                </>
              ) : (
                <>
                  <EyeOffIcon className="mr-2 h-3.5 w-3.5" />
                  <span>Ocultar conta</span>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          accountId={account.id}
          originalName={account.name}
          currentDisplayName={account.displayName}
        />
      </div>
    </div>
  );
}
