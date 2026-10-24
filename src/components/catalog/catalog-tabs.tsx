import Link from 'next/link';
import { cn } from '@/lib/utils';

export const CATALOG_TABS = [
  { value: 'categorias', label: 'Categorias' },
  { value: 'regras', label: 'Regras' },
  { value: 'estabelecimentos', label: 'Estabelecimentos' },
] as const;

export type CatalogTab = (typeof CATALOG_TABS)[number]['value'];

export function parseCatalogTab(value: string | undefined): CatalogTab {
  return CATALOG_TABS.find((t) => t.value === value)?.value ?? 'categorias';
}

/** Abas controladas pela URL (aba=...), como links para funcionar sem JavaScript. */
export function CatalogTabs({ active }: { active: CatalogTab }) {
  return (
    <nav aria-label="Seções" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1">
      {CATALOG_TABS.map((t) => (
        <Link
          key={t.value}
          href={t.value === 'estabelecimentos' ? '/estabelecimentos' : `/categorias?aba=${t.value}`}
          aria-current={t.value === active ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            t.value === active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
