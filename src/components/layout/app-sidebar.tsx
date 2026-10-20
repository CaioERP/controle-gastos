'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
import { Wallet } from 'lucide-react';
import { ReviewCountBadge } from '@/components/review/review-count-badge';
import { SearchTrigger } from './command-palette';

export interface AppSidebarProps {
  footerSlot?: React.ReactNode;
  reviewCount?: number;
}

export function AppSidebar({ footerSlot, reviewCount = 0 }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card/50 backdrop-blur-sm h-screen sticky top-0 shrink-0">
      <div className="flex items-center gap-3 px-6 h-16 border-b border-border">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground font-bold">
          <Wallet className="h-4 w-4" />
        </div>
        <span className="font-semibold text-base tracking-tight">Controle de Gastos</span>
      </div>

      <div className="px-3 pt-3">
        <SearchTrigger />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {item.href === '/revisao' && <ReviewCountBadge count={reviewCount} />}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          {footerSlot}
        </div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
