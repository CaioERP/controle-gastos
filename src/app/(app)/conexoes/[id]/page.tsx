import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangleIcon, CheckCircle2Icon, ClockIcon, RefreshCwIcon, XCircleIcon } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { ACCOUNT_TYPE_LABELS, CONNECTION_STATUS_LABELS } from '@/server/domain/labels';
import { getConnectionHealthDetail } from '@/server/queries/connections';
import { Badge } from '@/components/ui/badge';
import { DateBR } from '@/components/format/date-br';
import { Money } from '@/components/format/money';
import { ReconnectButton, SyncConnectionButton } from '@/components/connections/reconnect-button';
import { SyncDailyChart } from '@/components/connections/sync-daily-chart';
import { SyncHistory } from '@/components/connections/sync-history';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ConexaoDetalhePage({ params }: Props) {
  const { id } = await params;
  const db = getDb();
  const detail = await getConnectionHealthDetail(db, id);

  if (!detail) {
    notFound();
  }

  const { connection, health, accounts, runs, dailyStats } = detail;
  const instName = connection.institution?.name ?? 'Meu Pluggy';

  const isCriticalBanner =
    connection.status === 'expired' ||
    connection.status === 'revoked' ||
    connection.status === 'error' ||
    health.consentExpired ||
    health.isPausedByErrors;

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

  const consentDateISO =
    connection.consentExpiresAt && isValid(new Date(connection.consentExpiresAt))
      ? new Date(connection.consentExpiresAt).toISOString().slice(0, 10)
      : null;

  const consentSubtext = (() => {
    if (health.consentDaysRemaining === null) return 'Sem data de expiração';
    if (health.consentExpired) return 'Expirado';
    const d = health.consentDaysRemaining;
    return `Expira em ${d} ${d === 1 ? 'dia' : 'dias'}`;
  })();

  const syncRelative =
    connection.lastSyncedAt && isValid(new Date(connection.lastSyncedAt))
      ? formatDistanceToNow(new Date(connection.lastSyncedAt), { addSuffix: true, locale: ptBR })
      : 'Nunca sincronizado';

  const syncExact =
    connection.lastSyncedAt && isValid(new Date(connection.lastSyncedAt))
      ? format(new Date(connection.lastSyncedAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })
      : 'Nenhuma sincronização registrada';

  const stabilityLabel = (() => {
    if (health.isPausedByErrors) return 'Pausada (3+ falhas seguidas)';
    if (health.consecutiveErrors > 0) return 'Atenção (1–2 falhas recentes)';
    return 'Operando normalmente';
  })();

  const stabilitySubtext = (() => {
    if (health.consecutiveErrors === 0) return '0 falhas consecutivas';
    return `${health.consecutiveErrors} ${health.consecutiveErrors === 1 ? 'falha recente' : 'falhas seguidas'}`;
  })();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/conexoes"
          className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-4 hover:underline mb-3"
        >
          ← Voltar para Conexões
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            {connection.institution ? (
              <span
                className="h-3.5 w-3.5 rounded-full shrink-0 shadow-2xs"
                style={{ backgroundColor: connection.institution.color }}
              />
            ) : (
              <span className="h-3.5 w-3.5 rounded-full shrink-0 bg-primary/60 shadow-2xs" />
            )}
            <h1 className="text-xl font-bold tracking-tight text-foreground">{instName}</h1>
            {statusBadge()}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SyncConnectionButton connectionId={connection.id} />
            <ReconnectButton
              connectionId={connection.id}
              externalItemId={connection.externalId}
              variant={isCriticalBanner ? 'default' : 'outline'}
            />
          </div>
        </div>
      </div>

      {/* Banner de diagnóstico amigável */}
      {health.recommendedAction && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
            isCriticalBanner
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
          }`}
        >
          <AlertTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Ação recomendada</p>
            <p className="text-xs leading-relaxed">{health.recommendedAction}</p>
          </div>
        </div>
      )}

      {/* Cards de indicadores */}
      <section aria-label="Diagnóstico da conexão" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-1" data-testid="card-consent">
          <p className="text-xs font-medium text-muted-foreground">Status do consentimento</p>
          <p className="text-base font-semibold text-foreground">{consentSubtext}</p>
          <p className="text-xs text-muted-foreground">
            {consentDateISO ? (
              <>
                Vencimento: <DateBR date={consentDateISO} />
              </>
            ) : (
              'Não informado pela instituição'
            )}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-1" data-testid="card-last-sync">
          <p className="text-xs font-medium text-muted-foreground">Última sincronização</p>
          <p className="text-base font-semibold text-foreground">{syncRelative}</p>
          <p className="text-xs text-muted-foreground">{syncExact}</p>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-1" data-testid="card-stability">
          <p className="text-xs font-medium text-muted-foreground">Estabilidade</p>
          <p className="text-base font-semibold text-foreground">{stabilityLabel}</p>
          <p className="text-xs text-muted-foreground">{stabilitySubtext}</p>
        </div>
      </section>

      {/* Gráfico de transações novas por dia */}
      <section className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Transações novas por dia (últimos 30 dias)
          </h2>
          <p className="text-xs text-muted-foreground">
            Volume de lançamentos criados em execuções de sincronização desta conexão.
          </p>
        </div>
        <SyncDailyChart data={dailyStats} />
      </section>

      {/* Contas vinculadas */}
      <section className="rounded-xl border bg-card overflow-hidden shadow-2xs">
        <div className="p-3 border-b bg-muted/20">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contas vinculadas ({accounts.length})
          </h2>
        </div>
        {accounts.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            Nenhuma conta vinculada diretamente a esta conexão.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {accounts.map((acc) => {
              const updatedText =
                acc.balanceUpdatedAt && isValid(new Date(acc.balanceUpdatedAt))
                  ? format(new Date(acc.balanceUpdatedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                  : '—';
              return (
                <div
                  key={acc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2 text-xs"
                >
                  <div>
                    <p className="font-medium text-foreground">{acc.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {ACCOUNT_TYPE_LABELS[acc.type]} · Atualizado em {updatedText}
                    </p>
                  </div>
                  <div className="text-sm">
                    <Money cents={acc.balanceCents} colored />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Histórico de execuções da conexão */}
      <SyncHistory runs={runs} />
    </div>
  );
}
