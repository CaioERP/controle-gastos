'use client';

import * as React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationsPopover } from './notifications-popover';
import type { NotificationPreferenceRow, NotificationRow } from '@/server/queries/notifications';
import { cn } from '@/lib/utils';

type NotificationBellProps = {
  unreadCount?: number;
  initialNotifications?: NotificationRow[];
  preferences?: NotificationPreferenceRow[];
  className?: string;
};

export function NotificationBell({
  unreadCount = 0,
  initialNotifications = [],
  preferences = [],
  className,
}: NotificationBellProps) {
  const badgeText = unreadCount > 99 ? '99+' : unreadCount.toString();

  const triggerButton = (
    <Button
      variant="ghost"
      size="icon"
      className={cn('relative h-9 w-9 text-muted-foreground hover:text-foreground', className)}
      aria-label={`Notificações: ${unreadCount} não lidas`}
      data-testid="notification-bell-btn"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span
          data-testid="notification-badge"
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs animate-in zoom-in-50"
        >
          {badgeText}
        </span>
      )}
      <span className="sr-only">Notificações</span>
    </Button>
  );

  return (
    <NotificationsPopover
      trigger={triggerButton}
      unreadCount={unreadCount}
      initialNotifications={initialNotifications}
      preferences={preferences}
    />
  );
}
