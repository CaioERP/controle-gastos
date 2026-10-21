'use client';

import * as React from 'react';
import { NavList } from './nav-list';
import { ThemeToggle } from './theme-toggle';
import { Wallet } from 'lucide-react';
import { SearchTrigger } from './command-palette';
import { NotificationBell } from '@/components/notifications/notification-bell';
import type { NotificationPreferenceRow, NotificationRow } from '@/server/queries/notifications';

export interface AppSidebarProps {
  footerSlot?: React.ReactNode;
  reviewCount?: number;
  unreadNotificationsCount?: number;
  recentNotifications?: NotificationRow[];
  notificationPreferences?: NotificationPreferenceRow[];
}

export function AppSidebar({
  footerSlot,
  reviewCount = 0,
  unreadNotificationsCount = 0,
  recentNotifications = [],
  notificationPreferences = [],
}: AppSidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card/50 backdrop-blur-sm h-screen sticky top-0 shrink-0">
      <div className="flex items-center gap-3 px-6 h-16 border-b border-border">
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground font-bold">
          <Wallet className="h-4 w-4" />
        </div>
        <span className="font-semibold text-base tracking-tight">Controle de Gastos</span>
      </div>

      <div className="px-3 pt-3 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <SearchTrigger />
        </div>
        <NotificationBell
          unreadCount={unreadNotificationsCount}
          initialNotifications={recentNotifications}
          preferences={notificationPreferences}
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavList reviewCount={reviewCount} />
      </nav>

      <div className="p-4 border-t border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">{footerSlot}</div>
        <ThemeToggle />
      </div>
    </aside>
  );
}
