'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { refreshMarketPricesAction } from '@/app/(app)/investimentos/actions';

export function RefreshPricesButton() {
  const [isPending, startTransition] = React.useTransition();

  function handleRefresh() {
    startTransition(async () => {
      const res = await refreshMarketPricesAction();
      if (res.ok) {
        const stats = res.data;
        const totalQuotes = stats.b3Updated + stats.treasuryUpdated + stats.cryptoUpdated;
        const msg = `Cotações atualizadas (${totalQuotes} ativos, ${stats.benchmarksUpdated} benchmarks)`;
        toast.success(msg);
      } else {
        toast.error(res.error.message || 'Erro ao atualizar cotações');
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={isPending}
      className="gap-2"
    >
      <RefreshCw className={`size-4 ${isPending ? 'animate-spin' : ''}`} />
      <span>{isPending ? 'Atualizando...' : 'Atualizar cotações'}</span>
    </Button>
  );
}
