'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { SyncRunRow } from '@/server/queries/connections';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type SyncHistoryProps = {
  runs: SyncRunRow[];
};

function formatRunStats(stats: unknown): string | null {
  if (!stats || typeof stats !== 'object') return null;
  const s = stats as { created?: number; updated?: number };
  if (typeof s.created !== 'number' && typeof s.updated !== 'number') return null;
  const created = s.created ?? 0;
  const updated = s.updated ?? 0;
  return `+${created} ${created === 1 ? 'nova' : 'novas'}, ${updated} ${updated === 1 ? 'atualizada' : 'atualizadas'}`;
}

export function SyncHistory({ runs }: SyncHistoryProps) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        Nenhuma sincronização executada ainda.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-2xs" data-testid="sync-history">
      <div className="p-3 border-b bg-muted/20">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Últimas Execuções ({runs.length})
        </h4>
      </div>

      <div className="divide-y divide-border">
        {runs.map((run) => {
          const started = isValid(new Date(run.startedAt))
            ? format(new Date(run.startedAt), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })
            : '—';

          let duration = '—';
          if (run.finishedAt && isValid(new Date(run.finishedAt)) && isValid(new Date(run.startedAt))) {
            const diffMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
            duration = diffMs < 1000 ? `${diffMs}ms` : `${(diffMs / 1000).toFixed(1)}s`;
          }

          const isSuccess = run.status === 'success';
          const statsText = formatRunStats(run.stats);

          return (
            <div
              key={run.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2 text-xs hover:bg-muted/30 transition-colors"
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="font-medium text-foreground">{run.job}</span>
                  <Badge
                    variant={isSuccess ? 'outline' : 'destructive'}
                    className={
                      isSuccess
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] py-0 px-1.5'
                        : 'text-[10px] py-0 px-1.5'
                    }
                  >
                    {run.status}
                  </Badge>
                  {statsText && (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      ({statsText})
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Iniciado em {started} · Duração: {duration}
                </span>
              </div>

              {run.error && (
                <div className="text-[11px] text-destructive max-w-sm truncate">
                  {run.error}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
