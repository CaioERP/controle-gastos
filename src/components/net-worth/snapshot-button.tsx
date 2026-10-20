'use client';

import * as React from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { captureNetWorthSnapshotAction } from '@/app/(app)/patrimonio/actions';

export function SnapshotButton() {
  const [isPending, startTransition] = React.useTransition();

  const handleCapture = () => {
    startTransition(async () => {
      const res = await captureNetWorthSnapshotAction();
      if (res.ok) {
        toast.success('Snapshot de patrimônio registrado com sucesso');
      } else {
        toast.error(res.error.message || 'Erro ao registrar snapshot');
      }
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCapture}
      disabled={isPending}
      className="gap-2"
    >
      <Camera className={`size-4 ${isPending ? 'animate-pulse' : ''}`} />
      <span>{isPending ? 'Registrando...' : 'Registrar snapshot de hoje'}</span>
    </Button>
  );
}
