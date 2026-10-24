'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { SearchTrigger } from './command-palette';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { pageTitleFor } from './page-title';
import type { NotificationPreferenceRow, NotificationRow } from '@/server/queries/notifications';

export interface MobileNavProps {
  footerSlot?: React.ReactNode;
  reviewCount?: number;
  unreadNotificationsCount?: number;
  recentNotifications?: NotificationRow[];
  notificationPreferences?: NotificationPreferenceRow[];
}

/**
 * Cabeçalho do celular (< md). Mostra o título da tela ativa à esquerda e,
 * à direita, busca rápida e notificações.
 * Privacidade e tema ficam no menu "Mais" (BottomNav).
 */
export function MobileNav({
  unreadNotificationsCount = 0,
  recentNotifications = [],
  notificationPreferences = [],
}: MobileNavProps) {
  const pathname = usePathname();
  const title = pageTitleFor(pathname);

  return (
    <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
      <span
        role="heading"
        aria-level={1}
        className="text-lg font-semibold tracking-tight text-foreground truncate"
      >
        {title}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <SearchTrigger iconOnly />
        <NotificationBell
          unreadCount={unreadNotificationsCount}
          initialNotifications={recentNotifications}
          preferences={notificationPreferences}
        />
      </div>
    </header>
  );
}
