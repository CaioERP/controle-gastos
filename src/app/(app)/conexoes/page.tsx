import { getDb } from '@/server/db/client';
import { listConnections, listSyncRuns } from '@/server/queries/connections';
import { ConnectionCard } from '@/components/connections/connection-card';
import { ConnectButton } from '@/components/connections/connect-button';
import { SyncAllButton } from '@/components/connections/sync-all-button';
import { SyncHistory } from '@/components/connections/sync-history';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';

export const dynamic = 'force-dynamic';

export default async function ConexoesPage() {
  const db = getDb();
  const [connections, runs] = await Promise.all([
    listConnections(db),
    listSyncRuns(db, { limit: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Conexões"
          description="Acompanhe as instituições financeiras integradas e o histórico de sincronização."
        />
        {connections.length > 0 && <SyncAllButton />}
      </div>

      <div className="p-4 rounded-xl border bg-muted/20">
        <ConnectButton />
      </div>

      {connections.length === 0 ? (
        <EmptyState
          title="Nenhuma conexão ativa"
          description="Conecte seu banco pelo Open Finance usando o Meu Pluggy para sincronizar transações e faturas automaticamente."
        />
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Instituições Conectadas ({connections.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections.map((c) => (
                <ConnectionCard key={c.id} connection={c} />
              ))}
            </div>
          </div>

          <div className="pt-2">
            <SyncHistory runs={runs} />
          </div>
        </div>
      )}
    </div>
  );
}
