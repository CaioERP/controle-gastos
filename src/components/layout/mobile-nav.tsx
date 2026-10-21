'use client';

import * as React from 'react';
import { NavList } from './nav-list';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Wallet } from 'lucide-react';
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
            <nav className="flex-1 overflow-y-auto p-3">
              <NavList reviewCount={reviewCount} onNavigate={() => setOpen(false)} />
            </nav>
            {footerSlot && <div className="p-4 border-t border-border">{footerSlot}</div>}
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
