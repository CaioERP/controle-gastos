'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { KeyRoundIcon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { reconnectConnectionAction, triggerSyncAction } from '@/app/(app)/conexoes/actions';

// Import dinâmico do widget Pluggy Connect para evitar SSR
const PluggyConnect = dynamic(
  () => import('react-pluggy-connect').then((m) => m.PluggyConnect),
  { ssr: false }
);

type ReconnectButtonProps = {
  connectionId: string;
  externalItemId: string;
  label?: string;
  variant?: 'default' | 'outline' | 'secondary' | 'destructive';
};

export function ReconnectButton({
  connectionId,
  externalItemId,
  label = 'Reconectar',
  variant = 'default',
}: ReconnectButtonProps) {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pluggy/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: externalItemId }),
      });
      if (!res.ok) {
        throw new Error('Endpoint não disponível');
      }
      const data = (await res.json()) as { accessToken: string };
      setToken(data.accessToken);
    } catch {
      toast.info(
        'A reconexão direta via Open Finance estará disponível com a ativação das credenciais da Pluggy.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={loading}
        variant={variant}
        size="sm"
        className="gap-1.5 text-xs h-8"
      >
        <KeyRoundIcon className="h-3.5 w-3.5" />
        <span>{loading ? 'Carregando...' : label}</span>
      </Button>

      {token && (
        <PluggyConnect
          connectToken={token}
          updateItem={externalItemId}
          includeSandbox={false}
          onSuccess={async () => {
            const r = await reconnectConnectionAction({ connectionId });
            if (r.ok) {
              toast.success('Conexão atualizada e sincronizada com sucesso!');
            } else {
              toast.error(r.error.message);
            }
            setToken(null);
          }}
          onError={() => {
            toast.error('Não foi possível atualizar a conexão bancária.');
          }}
          onClose={() => setToken(null)}
        />
      )}
    </>
  );
}

export function SyncConnectionButton({ connectionId }: { connectionId: string }) {
  const [isPending, startTransition] = React.useTransition();

  const handleSync = () => {
    startTransition(async () => {
      const res = await triggerSyncAction({ connectionId });
      if (res.ok) {
        toast.success('Sincronização concluída com sucesso');
      } else {
        toast.error(res.error.message);
      }
    });
  };

  return (
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
  );
}
