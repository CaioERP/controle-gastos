'use client';

import * as React from 'react';
import { ThemeToggle } from './theme-toggle';
import { PrivacyToggle } from './privacy-toggle';
import { Wallet } from 'lucide-react';
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

/**
 * Cabeçalho do celular (< md). Contém logo, busca rápida, notificações,
 * alternador de privacidade e alternador de tema.
 * O botão de menu hambúrguer foi substituído pela BottomNav.
 */
export function MobileNav({
  unreadNotificationsCount = 0,
  recentNotifications = [],
  notificationPreferences = [],
}: MobileNavProps) {
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
        <PrivacyToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
