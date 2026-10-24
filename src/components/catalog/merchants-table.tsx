'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PencilIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/states/empty-state';
import type { MerchantRow } from '@/server/queries/catalog';
import type { CategoryOptionGroup } from './catalog-helpers';
import { MerchantDialog } from './merchant-dialog';

type MerchantsTableProps = {
  merchants: MerchantRow[];
  search: string;
  categoryGroups: CategoryOptionGroup[];
};

const GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_14rem_7rem_2.5rem] md:items-center md:gap-3';

export function MerchantsTable({ merchants, search, categoryGroups }: MerchantsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState(search);
  const [editing, setEditing] = React.useState<MerchantRow | null>(null);
  // Último valor que este campo mandou para a URL e o último `search` visto. O componente não é
  // recriado a cada busca (o input perderia o foco); quando `search` muda por fora (voltar/avançar),
  // o campo acompanha. O eco da própria digitação é ignorado para não apagar o que já foi digitado.
  const [sent, setSent] = React.useState(search);
  const [seenSearch, setSeenSearch] = React.useState(search);
  if (search !== seenSearch) {
    setSeenSearch(search);
    if (search !== sent) {
      setQuery(search);
      setSent(search);
    }
  }

  // Busca na URL (q=), com atraso para não navegar a cada tecla
  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === search) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ aba: 'estabelecimentos' });
      if (trimmed) params.set('q', trimmed);
      setSent(trimmed);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(handle);
  }, [query, search, pathname, router]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Buscar estabelecimento"
          placeholder="Buscar estabelecimento"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {merchants.length === 0 ? (
        <EmptyState
          title={search ? 'Nenhum estabelecimento encontrado' : 'Nenhum estabelecimento ainda'}
          description={search ? `Nada corresponde a "${search}".` : 'Eles aparecem conforme as transações são sincronizadas.'}
        />
      ) : (
        <div className="rounded-xl border">
          <div className={`hidden border-b px-4 py-2 text-xs font-medium text-muted-foreground ${GRID}`}>
            <span>Nome</span>
            <span>Categoria padrão</span>
            <span className="text-right">Transações</span>
            <span className="sr-only">Editar</span>
          </div>
          <ul className="divide-y">
            {merchants.map((m) => (
              <li key={m.id} data-testid="merchant-row" className={`flex items-center gap-3 px-4 py-2.5 ${GRID}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    <Link href={`/estabelecimentos/${m.id}`} className="hover:underline text-foreground">
                      {m.name}
                    </Link>
                  </div>
                  <div className="truncate text-xs text-muted-foreground md:hidden">
                    {m.defaultCategory?.name ?? 'Sem categoria padrão'} · {m.transactionCount}{' '}
                    {m.transactionCount === 1 ? 'transação' : 'transações'}
                  </div>
                </div>
                <span className="hidden truncate text-sm text-muted-foreground md:block">
                  {m.defaultCategory?.name ?? '—'}
                </span>
                <span className="hidden text-right text-sm tabular-nums md:block">{m.transactionCount}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(m)} aria-label={`Editar ${m.name}`}>
                  <PencilIcon />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MerchantDialog merchant={editing} onClose={() => setEditing(null)} categoryGroups={categoryGroups} />
    </div>
  );
}
