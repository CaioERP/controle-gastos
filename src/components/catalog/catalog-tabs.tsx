'use client';

import * as React from 'react';
import Link, { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATALOG_TABS, type CatalogTab } from './catalog-tab-types';

export { CATALOG_TABS, parseCatalogTab, type CatalogTab } from './catalog-tab-types';

function TabInner({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1.5">
      {pending && <Loader2 className="size-3 animate-spin shrink-0" />}
      <span>{label}</span>
    </span>
  );
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
          <TabInner label={t.label} />
        </Link>
      ))}
    </nav>
  );
}
