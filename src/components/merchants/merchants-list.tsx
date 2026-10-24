'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SearchIcon, StoreIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Money } from '@/components/format/money';
import { formatDateBR } from '@/server/domain/dates';
import { EmptyState } from '@/components/states/empty-state';

export type MerchantSpendItem = {
  id: string;
  name: string;
  categoryName: string | null;
  totalCents: number;
  count: number;
  lastDate: string;
};

type MerchantsListProps = {
  items: MerchantSpendItem[];
  search?: string;
};

export function MerchantsList({ items, search = '' }: MerchantsListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState(search);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === search) return;
    const handle = setTimeout(() => {
      const sp = new URLSearchParams();
      if (trimmed) sp.set('q', trimmed);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
          placeholder="Buscar estabelecimento…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title={search ? 'Nenhum estabelecimento encontrado' : 'Nenhum estabelecimento com gasto'}
          description={
            search
              ? `Nenhum estabelecimento corresponde a "${search}".`
              : 'Assim que houver compras em estabelecimentos nos últimos 12 meses, eles aparecem aqui.'
          }
        />
      ) : (
        <ul className="divide-y divide-border/50 rounded-xl border border-border/60 bg-card overflow-hidden">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/estabelecimentos/${item.id}`}
                className="flex items-center justify-between gap-3 p-3.5 sm:p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                    <StoreIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-foreground truncate">
                      {item.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                      <span>{item.categoryName ?? 'Sem categoria'}</span>
                      <span>·</span>
                      <span>
                        {item.count} {item.count === 1 ? 'compra' : 'compras'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <Money
                    cents={item.totalCents}
                    className="font-semibold text-sm sm:text-base text-foreground block"
                  />
                  <span className="text-[11px] text-muted-foreground block mt-0.5">
                    última em {formatDateBR(item.lastDate)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
