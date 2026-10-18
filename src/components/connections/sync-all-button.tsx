'use client';

import * as React from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { triggerSyncAction } from '@/app/(app)/conexoes/actions';

export function SyncAllButton() {
  const [isPending, startTransition] = React.useTransition();

  const handleSyncAll = () => {
    startTransition(async () => {
      const res = await triggerSyncAction({ connectionId: null });
      if (res.ok) {
        toast.success('Sincronização global disparada com sucesso');
      } else {
        toast.error(res.error.message);
      }
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSyncAll}
      disabled={isPending}
      className="gap-1.5 text-xs font-medium h-9"
    >
      <RefreshCwIcon className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
      <span>{isPending ? 'Sincronizando...' : 'Sincronizar tudo'}</span>
    </Button>
  );
}
