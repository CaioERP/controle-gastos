import Link from 'next/link';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FORMAT_LABELS } from '@/components/imports/import-preview-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { ImportBatchStatus } from '@/server/domain/enums';
import type { ImportBatchRow } from '@/server/queries/imports';

const STATUS_LABELS: Record<ImportBatchStatus, string> = {
  confirmed: 'Confirmada',
  preview: 'Em pré-visualização',
  discarded: 'Descartada',
};

type ImportHistoryTableProps = {
  batches: ImportBatchRow[];
};

export function ImportHistoryTable({ batches }: ImportHistoryTableProps) {
  if (batches.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-xs text-muted-foreground">
        Nenhuma importação realizada ainda.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-2xs" data-testid="import-history-table">
      <div className="p-3 border-b bg-muted/20">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Histórico de Importações ({batches.length})
        </h3>
      </div>

      <div className="divide-y divide-border">
        {batches.map((b) => {
          const createdStr = isValid(new Date(b.createdAt))
            ? format(new Date(b.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })
            : '—';

          const formatLabel = FORMAT_LABELS[b.format] ?? b.format;

          const created = b.stats.created ?? b.stats.newCount ?? 0;
          const linked = b.stats.linked ?? 0;
          const skipped = b.stats.skippedDuplicates ?? 0;
          const summaryStr = `${created} ${created === 1 ? 'nova' : 'novas'} · ${linked} ${linked === 1 ? 'vinculada' : 'vinculadas'} · ${skipped} ${skipped === 1 ? 'ignorada' : 'ignoradas'}`;

          return (
            <div
              key={b.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 gap-2 text-xs hover:bg-muted/20 transition-colors"
            >
              <div className="space-y-0.5">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="font-medium text-foreground">{b.filename}</span>
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                    {formatLabel}
                  </Badge>
                  <Badge
                    variant={b.status === 'confirmed' ? 'outline' : 'secondary'}
                    className={
                      b.status === 'confirmed'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] py-0 px-1.5'
                        : 'text-[10px] py-0 px-1.5'
                    }
                  >
                    {STATUS_LABELS[b.status]}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {createdStr} · {b.institutionName} ({b.accountName}) · {summaryStr}
                </p>
              </div>

              {b.status === 'preview' && (
                <div>
                  <Link
                    href={`/importar?lote=${b.id}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-7 text-xs' })}
                  >
                    Retomar
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
