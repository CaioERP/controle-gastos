'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, Store } from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { DateBR } from '@/components/format/date-br';
import { Money } from '@/components/format/money';
import { NAV_ITEMS } from '@/components/layout/nav-items';
import { globalSearchAction } from '@/app/(app)/search-actions';
import { monthEnd, monthStart } from '@/server/domain/dates';
import type { GlobalSearchResult } from '@/server/queries/search';
import { parseFilters, withFilters } from '@/server/queries/url-filters';
import { cn } from '@/lib/utils';

type CommandPaletteContextType = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const CommandPaletteContext = React.createContext<CommandPaletteContextType | null>(null);

export function useCommandPalette() {
  const context = React.useContext(CommandPaletteContext);
  if (!context) {
    throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  }
  return context;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      <CommandPalette />
    </CommandPaletteContext.Provider>
  );
}

export function SearchTrigger({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  const { setOpen } = useCommandPalette();

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? 'icon' : 'sm'}
      onClick={() => setOpen(true)}
      className={cn(
        iconOnly
          ? 'h-9 w-9'
          : 'w-full justify-between h-9 px-3 text-xs text-muted-foreground bg-muted/40 hover:bg-muted/70 border-input/60 shadow-xs',
        className
      )}
      aria-label="Buscar..."
    >
      <span className="inline-flex items-center gap-2">
        <Search className="size-3.5 shrink-0" />
        {!iconOnly && <span>Buscar…</span>}
      </span>
      {!iconOnly && (
        <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          Ctrl K
        </kbd>
      )}
    </Button>
  );
}

const EMPTY_RESULTS: GlobalSearchResult = {
  categories: [],
  merchants: [],
  transactions: [],
};

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<GlobalSearchResult>(EMPTY_RESULTS);
  const latestQueryRef = React.useRef('');

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setResults(EMPTY_RESULTS);
      setLoading(false);
      latestQueryRef.current = '';
    }
  };

  // Atalho global Ctrl+K / Cmd+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (!next) {
            setQuery('');
            setResults(EMPTY_RESULTS);
            setLoading(false);
            latestQueryRef.current = '';
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOpen]);

  // Busca no servidor com debounce de 200 ms
  React.useEffect(() => {
    const trimmed = query.trim();
    latestQueryRef.current = trimmed;

    if (trimmed.length < 2) return;

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      globalSearchAction(trimmed)
        .then((res) => {
          if (active && latestQueryRef.current === trimmed) {
            setResults(res.ok ? res.data : EMPTY_RESULTS);
          }
        })
        .finally(() => {
          if (active && latestQueryRef.current === trimmed) {
            setLoading(false);
          }
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const trimmed = query.trim();
  const effectiveResults = trimmed.length < 2 ? EMPTY_RESULTS : results;

  // Grupo Telas: filtrado localmente pelo texto; com campo vazio mostra todas
  const trimmedLower = trimmed.toLowerCase();
  const filteredScreens = React.useMemo(() => {
    if (!trimmedLower) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(trimmedLower));
  }, [trimmedLower]);

  const handleSelectScreen = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const handleSelectCategory = (id: string) => {
    handleOpenChange(false);
    const href = withFilters('/transacoes', { categoryIds: [id] }, parseFilters({}));
    router.push(href);
  };

  const handleSelectMerchant = (name: string) => {
    handleOpenChange(false);
    const sp = new URLSearchParams({ aba: 'estabelecimentos', q: name });
    router.push(`/categorias?${sp.toString()}`);
  };

  const handleSelectTransaction = (description: string, date: string) => {
    handleOpenChange(false);
    const href = withFilters(
      '/transacoes',
      { search: description, from: monthStart(date), to: monthEnd(date) },
      parseFilters({})
    );
    router.push(href);
  };

  const hasAnyResult =
    filteredScreens.length > 0 ||
    effectiveResults.categories.length > 0 ||
    effectiveResults.merchants.length > 0 ||
    effectiveResults.transactions.length > 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Busca Global"
      description="Buscar telas, categorias, estabelecimentos e transações"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Buscar telas, categorias, estabelecimentos e transações…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="py-4 text-center text-xs text-muted-foreground">Buscando…</div>
          )}
          {!loading && !hasAnyResult && (
            <CommandEmpty>Nada encontrado.</CommandEmpty>
          )}

          {filteredScreens.length > 0 && (
            <CommandGroup heading="Telas">
              {filteredScreens.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`screen-${item.href}`}
                    onSelect={() => handleSelectScreen(item.href)}
                  >
                    <Icon className="mr-2 size-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {effectiveResults.categories.length > 0 && (
            <CommandGroup heading="Categorias">
              {effectiveResults.categories.map((cat) => (
                <CommandItem
                  key={cat.id}
                  value={`cat-${cat.id}`}
                  onSelect={() => handleSelectCategory(cat.id)}
                >
                  <span
                    className="mr-2 size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color }}
                    aria-hidden
                  />
                  <span>
                    {cat.parentName ? `${cat.parentName} › ${cat.name}` : cat.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {effectiveResults.merchants.length > 0 && (
            <CommandGroup heading="Estabelecimentos">
              {effectiveResults.merchants.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`merchant-${m.id}`}
                  onSelect={() => handleSelectMerchant(m.name)}
                >
                  <Store className="mr-2 size-4 text-muted-foreground" />
                  <span>{m.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {effectiveResults.transactions.length > 0 && (
            <CommandGroup heading="Transações">
              {effectiveResults.transactions.map((tx) => (
                <CommandItem
                  key={tx.id}
                  value={`tx-${tx.id}`}
                  onSelect={() => handleSelectTransaction(tx.description, tx.date)}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">{tx.description}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <DateBR date={tx.date} />
                      <span>·</span>
                      <span className="truncate">{tx.accountName}</span>
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money cents={tx.amountCents} signed />
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}