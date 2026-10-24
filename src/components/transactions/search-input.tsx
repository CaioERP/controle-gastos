'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parseFilters, withFilters } from '@/server/queries/url-filters';

const DEBOUNCE_MS = 300;

export type SearchInputProps = {
  className?: string;
};

/** Busca por descrição: atualiza `q` na URL 300 ms depois da última tecla. */
export function SearchInput({ className }: SearchInputProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get('q') ?? '';
  const [value, setValue] = React.useState(urlQ);
  const [syncedQ, setSyncedQ] = React.useState(urlQ);
  const [pushedQ, setPushedQ] = React.useState(urlQ);

  // A URL mudou por fora (ex.: "limpar filtros"): o campo acompanha. Se foi este campo que mudou a URL,
  // mantém o que o usuário digitou enquanto a navegação acontecia.
  if (urlQ !== syncedQ) {
    setSyncedQ(urlQ);
    if (urlQ !== pushedQ) setValue(urlQ);
  }

  React.useEffect(() => {
    if (value.trim() === urlQ.trim()) return;
    const timer = setTimeout(() => {
      const next = value.trim();
      setPushedQ(next);
      router.replace(withFilters(pathname, { search: next || undefined }, parseFilters(searchParams)), {
        scroll: false,
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, urlQ, pathname, router, searchParams]);

  return (
    <div className={cn('relative w-full sm:max-w-sm', className)}>
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por descrição"
        aria-label="Buscar transações"
        maxLength={200}
        className="pl-8"
      />
    </div>
  );
}
