'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';
import { ThemeToggle } from './theme-toggle';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Wallet } from 'lucide-react';
import { ReviewCountBadge } from '@/components/review/review-count-badge';
import { SearchTrigger } from './command-palette';
import { NotificationBell } from '@/components/notifications/notification-bell';
import type { NotificationPreferenceRow, NotificationRow } from '@/server/queries/notifications';

export interface MobileNavProps {
  footerSlot?: React.ReactNode;
  reviewCount?: number;
  unreadNotificationsCount?: number;
  recentNotifications?: NotificationRow[];
  notificationPreferences?: NotificationPreferenceRow[];
}

export function MobileNav({
  footerSlot,
  reviewCount = 0,
  unreadNotificationsCount = 0,
  recentNotifications = [],
  notificationPreferences = [],
}: MobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  return (
    <header className="md:hidden flex items-center justify-between px-4 h-16 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground font-bold">
          <Wallet className="h-4 w-4" />
        </div>
        <span className="font-semibold text-base">Controle de Gastos</span>
      </div>

      <div className="flex items-center gap-1.5">
        <SearchTrigger iconOnly />
        <NotificationBell
          unreadCount={unreadNotificationsCount}
          initialNotifications={recentNotifications}
          preferences={notificationPreferences}
        />
        <ThemeToggle />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Abrir menu de navegação">
                <Menu className="h-5 w-5" />
              </Button>
            }
          />
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetHeader className="p-4 border-b border-border text-left">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-5 w-5 text-primary" />
                Controle de Gastos
              </SheetTitle>
            </SheetHeader>
            <div className="p-3 pb-0">
              <SearchTrigger />
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
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
            {footerSlot && <div className="p-4 border-t border-border">{footerSlot}</div>}
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
