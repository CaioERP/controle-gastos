'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { ReviewSuggestion } from '@/server/queries/review';
import { confirmSuggestionAction } from '@/app/(app)/revisao/actions';

export const BULK_MIN_CONFIDENCE = 0.7;

type BulkConfirmProps = {
  pending: ReviewSuggestion[];
  /** Cada sugestão confirmada (o card some na hora). */
  onConfirmed: (transactionId: string) => void;
  onRunningChange: (running: boolean) => void;
};

/**
 * "Confirmar todas as sugestões com confiança ≥ 70%": uma action por item, para mostrar o progresso,
 * sem revalidar a cada uma; a página (contador e badge do menu) recarrega uma vez só no fim.
 */
export function BulkConfirm({ pending, onConfirmed, onRunningChange }: BulkConfirmProps) {
  const router = useRouter();
  const [progress, setProgress] = React.useState<{ current: number; total: number } | null>(null);
  const [, startBulk] = React.useTransition();

  if (pending.length === 0 && !progress) return null;

  const run = () => {
    const list = [...pending];
    if (list.length === 0) return;
    onRunningChange(true);
    startBulk(async () => {
      let ok = 0;
      for (let i = 0; i < list.length; i++) {
        setProgress({ current: i + 1, total: list.length });
        const s = list[i]!;
        const res = await confirmSuggestionAction({ transactionId: s.transactionId, categoryId: s.categoryId });
        if (res.ok) {
          ok++;
          onConfirmed(s.transactionId);
        }
      }
      startBulk(() => {
        router.refresh();
        setProgress(null);
        onRunningChange(false);
      });
      if (ok === list.length) toast.success(`${ok} sugest${ok === 1 ? 'ão confirmada' : 'ões confirmadas'}`);
      else toast.error(`${ok} de ${list.length} sugestões confirmadas; tente de novo as restantes.`);
    });
  };

  return (
    <Button
      variant="outline"
      onClick={run}
      disabled={progress !== null}
      className="h-auto min-h-8 whitespace-normal py-1.5 text-left"
    >
      {progress
        ? `Confirmando ${progress.current} de ${progress.total}...`
        : `Confirmar todas as sugestões com confiança ≥ ${Math.round(BULK_MIN_CONFIDENCE * 100)}% (${pending.length})`}
    </Button>
  );
}
