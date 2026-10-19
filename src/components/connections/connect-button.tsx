'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { PlusIcon, ShieldCheckIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { registerConnectionAction } from '@/app/(app)/conexoes/actions';

// Import dinâmico do widget Pluggy Connect para evitar SSR
const PluggyConnect = dynamic(
  () => import('react-pluggy-connect').then((m) => m.PluggyConnect),
  { ssr: false }
);

export function ConnectButton() {
  const [token, setToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pluggy/connect-token', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Endpoint não disponível');
      }
      const data = (await res.json()) as { accessToken: string };
      setToken(data.accessToken);
    } catch {
      toast.info(
        'A sincronização direta via Open Finance estará disponível em breve com a ativação das credenciais da Pluggy.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            Escolha <strong>MeuPluggy</strong> na lista. O acesso é somente leitura e pode ser revogado a qualquer momento.
          </span>
        </div>

        <Button
          onClick={handleClick}
          disabled={loading}
          size="sm"
          className="gap-1.5 text-xs font-medium"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          <span>{loading ? 'Carregando...' : 'Conectar nova conta'}</span>
        </Button>
      </div>

      {token && (
        <PluggyConnect
          connectToken={token}
          includeSandbox={false}
          onSuccess={async ({ item }) => {
            const r = await registerConnectionAction({ provider: 'pluggy', externalId: item.id });
            if (r.ok) {
              toast.success('Instituição conectada com sucesso!');
            } else {
              toast.error(r.error.message);
            }
            setToken(null);
          }}
          onError={() => {
            toast.error('Não foi possível conectar a conta bancária.');
          }}
          onClose={() => setToken(null)}
        />
      )}
    </div>
  );
}
