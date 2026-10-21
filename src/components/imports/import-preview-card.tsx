'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangleIcon, CheckCircle2Icon, FileSpreadsheetIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { confirmFileImportAction, discardFileImportAction } from '@/app/(app)/importar/actions';
import { DateBR } from '@/components/format/date-br';
import { Money } from '@/components/format/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { ImportBatchPreview, PreviewTransactionItem } from '@/server/commands/imports';

export const FORMAT_LABELS: Record<string, string> = {
  ofx: 'OFX',
  csv_nubank_checking: 'CSV Conta Nubank',
  csv_nubank_card: 'CSV Cartão Nubank',
  pdf_invoice: 'Fatura PDF',
};

type ImportPreviewCardProps = {
  preview: ImportBatchPreview;
  accountName: string;
  onDone: () => void;
};

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30';

export function ImportPreviewCard({ preview, accountName, onDone }: ImportPreviewCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  // Mapa de decisões por índice de item (string)
  // Valores internos no select: 'default' | 'import_as_new' | 'skip' | 'link:<txId>'
  const [choices, setChoices] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of preview.items) {
      if (item.status === 'new') {
        initial[String(item.index)] = 'import_as_new';
      } else if (item.status === 'fuzzy_duplicate') {
        initial[String(item.index)] = item.matchedTransactionId
          ? `link:${item.matchedTransactionId}`
          : 'skip';
      } else if (item.status === 'ambiguous_duplicate') {
        initial[String(item.index)] = item.candidates[0]
          ? `link:${item.candidates[0].transactionId}`
          : 'skip';
      } else {
        initial[String(item.index)] = 'skip';
      }
    }
    return initial;
  });

  const handleChoiceChange = (index: number, val: string) => {
    setChoices((prev) => ({ ...prev, [String(index)]: val }));
  };

  const buildDecisionsPayload = () => {
    const decisions: Record<
      string,
      'import_as_new' | 'skip' | { linkTransactionId: string }
    > = {};
    for (const item of preview.items) {
      const choice = choices[String(item.index)];
      if (!choice) continue;
      if (choice === 'import_as_new') {
        decisions[String(item.index)] = 'import_as_new';
      } else if (choice === 'skip') {
        decisions[String(item.index)] = 'skip';
      } else if (choice.startsWith('link:')) {
        decisions[String(item.index)] = { linkTransactionId: choice.slice(5) };
      }
    }
    return decisions;
  };

  const handleConfirm = () => {
    startTransition(async () => {
      const decisions = buildDecisionsPayload();
      const res = await confirmFileImportAction({
        batchId: preview.batchId,
        decisions,
      });

      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }

      const { created, linked, skippedDuplicates } = res.data;
      toast.success(
        `Importação concluída: ${created} ${created === 1 ? 'criada' : 'criadas'}, ${linked} ${linked === 1 ? 'vinculada' : 'vinculadas'}, ${skippedDuplicates} ${skippedDuplicates === 1 ? 'ignorada' : 'ignoradas'}`,
      );
      onDone();
      router.replace('/importar');
      router.refresh();
    });
  };

  const handleDiscard = () => {
    startTransition(async () => {
      const res = await discardFileImportAction({ batchId: preview.batchId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.info('Importação descartada');
      onDone();
      router.replace('/importar');
      router.refresh();
    });
  };

  const duplicateTotal =
    preview.summary.exactDuplicateCount + preview.summary.fuzzyDuplicateCount;
  const formatLabel = FORMAT_LABELS[preview.format] ?? preview.format;

  const renderStatusBadge = (item: PreviewTransactionItem) => {
    switch (item.status) {
      case 'new':
        return (
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          >
            Nova
          </Badge>
        );
      case 'exact_duplicate':
        return <Badge variant="secondary">Já importada</Badge>;
      case 'fuzzy_duplicate':
        return (
          <Badge
            variant="outline"
            className="border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400"
          >
            Já sincronizada (Pluggy)
          </Badge>
        );
      case 'ambiguous_duplicate':
        return (
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          >
            Conflito
          </Badge>
        );
    }
  };

  const renderActionControl = (item: PreviewTransactionItem) => {
    const val = choices[String(item.index)] ?? 'skip';

    if (item.status === 'exact_duplicate') {
      return <span className="text-xs text-muted-foreground">Será ignorada</span>;
    }

    if (item.status === 'new') {
      return (
        <select
          aria-label={`Ação para ${item.description}`}
          className={selectClass}
          value={val}
          onChange={(e) => handleChoiceChange(item.index, e.target.value)}
          disabled={isPending}
        >
          <option value="import_as_new">Importar</option>
          <option value="skip">Ignorar</option>
        </select>
      );
    }

    if (item.status === 'fuzzy_duplicate') {
      return (
        <select
          aria-label={`Ação para ${item.description}`}
          className={selectClass}
          value={val}
          onChange={(e) => handleChoiceChange(item.index, e.target.value)}
          disabled={isPending}
        >
          {item.matchedTransactionId && (
            <option value={`link:${item.matchedTransactionId}`}>Vincular à existente</option>
          )}
          <option value="import_as_new">Importar como nova</option>
          <option value="skip">Ignorar</option>
        </select>
      );
    }

    // ambiguous_duplicate
    return (
      <select
        aria-label={`Ação para ${item.description}`}
        className={selectClass}
        value={val}
        onChange={(e) => handleChoiceChange(item.index, e.target.value)}
        disabled={isPending}
      >
        {item.candidates.map((cand) => (
          <option key={cand.transactionId} value={`link:${cand.transactionId}`}>
            Vincular a: {cand.description} ({cand.date})
          </option>
        ))}
        <option value="import_as_new">Importar como nova</option>
        <option value="skip">Ignorar</option>
      </select>
    );
  };

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6 shadow-2xs space-y-5" data-testid="import-preview-card">
      {/* Cabeçalho do lote */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <FileSpreadsheetIcon className="h-4 w-4 text-primary shrink-0" />
            <h2 className="text-base font-semibold text-foreground">{preview.filename}</h2>
            <Badge variant="outline">{formatLabel}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Conta de destino: <strong className="text-foreground">{accountName}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          >
            {preview.summary.newCount} {preview.summary.newCount === 1 ? 'nova' : 'novas'}
          </Badge>
          <Badge variant="secondary">
            {duplicateTotal} {duplicateTotal === 1 ? 'duplicada já existente' : 'duplicadas já existentes'}
          </Badge>
          {preview.summary.ambiguousCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            >
              {preview.summary.ambiguousCount}{' '}
              {preview.summary.ambiguousCount === 1 ? 'conflito para decidir' : 'conflitos para decidir'}
            </Badge>
          )}
        </div>
      </div>

      {/* Resumo de fatura PDF (invoiceMeta) */}
      {preview.invoiceMeta && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border bg-muted/20 p-3 text-xs">
            <div>
              <span className="text-muted-foreground block">Fechamento</span>
              <span className="font-semibold text-foreground">
                {preview.invoiceMeta.closingDate ? (
                  <DateBR date={preview.invoiceMeta.closingDate} />
                ) : (
                  '—'
                )}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Vencimento</span>
              <span className="font-semibold text-foreground">
                <DateBR date={preview.invoiceMeta.dueDate} />
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Total da fatura</span>
              <Money cents={preview.invoiceMeta.totalCents} className="font-semibold text-foreground" />
            </div>
            <div>
              <span className="text-muted-foreground block">Soma dos itens</span>
              <Money cents={preview.invoiceMeta.itemsSumCents} className="font-semibold text-foreground" />
            </div>
          </div>

          {Math.abs(preview.invoiceMeta.divergenceCents) > 5 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Atenção: a soma dos itens extraídos difere em{' '}
                <Money cents={Math.abs(preview.invoiceMeta.divergenceCents)} /> do total da fatura no PDF.
                Revise os lançamentos abaixo antes de confirmar.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Lista / tabela responsiva de lançamentos */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">Data</th>
              <th className="px-3 py-2.5">Descrição</th>
              <th className="hidden sm:table-cell px-3 py-2.5">Forma</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.items.map((item) => {
              const isExact = item.status === 'exact_duplicate';
              return (
                <tr
                  key={item.index}
                  className={isExact ? 'opacity-55 bg-muted/10' : 'hover:bg-muted/20'}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <DateBR date={item.date} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-foreground">{item.description}</span>
                      {item.installment && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                          {item.installment.number}/{item.installment.total}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                    {PAYMENT_METHOD_LABELS[item.paymentMethod]}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Money sensitive={false} cents={item.amountCents} signed colored />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{renderStatusBadge(item)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{renderActionControl(item)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rodapé de confirmação / descarte */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDiscard}
          disabled={isPending}
          className="gap-1.5"
        >
          <Trash2Icon className="h-3.5 w-3.5" />
          <span>Descartar</span>
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleConfirm}
          disabled={isPending}
          className="gap-1.5"
        >
          <CheckCircle2Icon className="h-3.5 w-3.5" />
          <span>{isPending ? 'Processando...' : 'Confirmar importação'}</span>
        </Button>
      </div>
    </div>
  );
}
