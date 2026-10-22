'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export type HomeTab = 'conta' | 'cartoes' | 'geral';

interface HomeTabsProps {
  active: HomeTab;
}

interface TabItem {
  id: HomeTab;
  label: React.ReactNode;
}

const TABS: TabItem[] = [
  { id: 'conta', label: 'Conta' },
  { id: 'cartoes', label: 'Cartões' },
  {
    id: 'geral',
    label: (
      <>
        <span className="hidden md:inline">Visão geral</span>
        <span className="md:hidden">Geral</span>
      </>
    ),
  },
];

export function HomeTabs({ active }: HomeTabsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const getHref = React.useCallback(
    (tabId: HomeTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('aba', tabId);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );

  return (
    <nav
      aria-label="Abas do Início"
      className="inline-flex w-full md:w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground h-9"
    >
      <div className="flex w-full md:w-fit items-center gap-1">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={getHref(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex flex-1 md:flex-initial items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30'
                  : 'hover:text-foreground text-muted-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
