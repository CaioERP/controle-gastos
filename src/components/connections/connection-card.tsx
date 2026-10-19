'use client';

import * as React from 'react';
import { RefreshCwIcon, AlertTriangleIcon, CheckCircle2Icon, ClockIcon, XCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { triggerSyncAction } from '@/app/(app)/conexoes/actions';
import { CONNECTION_STATUS_LABELS } from '@/server/domain/labels';
import { formatDateBR } from '@/server/domain/dates';
import type { ConnectionRow } from '@/server/queries/connections';
import { differenceInDays, formatDistanceToNow, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ConnectionCardProps = {
  connection: ConnectionRow;
};

export function ConnectionCard({ connection }: ConnectionCardProps) {
  const [isPending, startTransition] = React.useTransition();

  const handleSync = () => {
    startTransition(async () => {
      const res = await triggerSyncAction({ connectionId: connection.id });
      if (res.ok) {
        toast.success('Sincronização concluída com sucesso');
      } else {
        toast.error(res.error.message);
      }
    });
  };

  const statusBadge = () => {
    switch (connection.status) {
      case 'active':
        return (
          <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="h-3 w-3" />
            <span>{CONNECTION_STATUS_LABELS[connection.status]}</span>
          </Badge>
        );
      case 'syncing':
        return (
          <Badge variant="outline" className="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <RefreshCwIcon className="h-3 w-3 animate-spin" />
            <span>{CONNECTION_STATUS_LABELS[connection.status]}</span>
          </Badge>
        );
      case 'error':
      case 'expired':
      case 'revoked':
        return (
          <Badge variant="outline" className="gap-1 border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <XCircleIcon className="h-3 w-3" />
            <span>{CONNECTION_STATUS_LABELS[connection.status]}</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1">
            <ClockIcon className="h-3 w-3" />
            <span>{CONNECTION_STATUS_LABELS[connection.status]}</span>
          </Badge>
        );
    }
  };

  const syncTimeAgo = connection.lastSyncedAt && isValid(new Date(connection.lastSyncedAt))
    ? formatDistanceToNow(new Date(connection.lastSyncedAt), { addSuffix: true, locale: ptBR })
    : 'Nunca sincronizado';

  const isConsentExpiringSoon = connection.consentExpiresAt && isValid(new Date(connection.consentExpiresAt))
    ? differenceInDays(new Date(connection.consentExpiresAt), new Date()) <= 15
    : false;

  return (
    <div className="flex flex-col justify-between p-4 rounded-xl border bg-card gap-4 shadow-2xs hover:border-foreground/20 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {connection.institution ? (
            <span
              className="h-3 w-3 rounded-full shrink-0 shadow-2xs"
              style={{ backgroundColor: connection.institution.color }}
            />
          ) : (
            <span className="h-3 w-3 rounded-full shrink-0 bg-primary/60 shadow-2xs" />
          )}
          <div>
            <h4 className="font-semibold text-sm text-foreground">
              {connection.institution?.name ?? 'Meu Pluggy'}
            </h4>
            <p className="text-xs text-muted-foreground">
              {connection.accountCount} {connection.accountCount === 1 ? 'conta conectada' : 'contas conectadas'}
            </p>
          </div>
        </div>

        {statusBadge()}
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
          <span>Última sincronização:</span>
          <span className="text-foreground font-medium">{syncTimeAgo}</span>
        </div>

        {connection.lastError && (
          <div className="flex items-start gap-1.5 p-2 rounded-md bg-destructive/10 text-destructive text-[11px]">
            <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{connection.lastError}</span>
          </div>
        )}

        {isConsentExpiringSoon && connection.consentExpiresAt && (
          <div className="flex items-start gap-1.5 p-2 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px]">
            <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Consentimento expira em {formatDateBR(new Date(connection.consentExpiresAt).toISOString().slice(0, 10))}.</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end pt-1 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={isPending}
          className="text-xs gap-1.5 h-8"
        >
          <RefreshCwIcon className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
          <span>{isPending ? 'Sincronizando...' : 'Sincronizar agora'}</span>
        </Button>
      </div>
    </div>
  );
}
