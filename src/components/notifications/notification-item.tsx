'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  CreditCard,
  ShieldAlert,
  RefreshCw,
  ArrowUpRight,
  Sparkles,
  Check,
  CalendarX,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { NotificationRow } from '@/server/queries/notifications';
import { markNotificationReadAction } from '@/app/(app)/notificacoes/actions';
import { cn } from '@/lib/utils';

type NotificationItemProps = {
  notification: NotificationRow;
  compact?: boolean;
};

export function getNotificationIcon(type: NotificationRow['type']) {
  switch (type) {
    case 'threshold_100':
      return {
        icon: AlertTriangle,
        color: 'text-rose-600 dark:text-rose-400',
        bg: 'bg-rose-500/15',
      };
    case 'threshold_80':
      return {
        icon: AlertCircle,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/15',
      };
    case 'pace_warning':
      return {
        icon: TrendingUp,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/15',
      };
    case 'invoice_due_soon':
      return {
        icon: CreditCard,
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-500/15',
      };
    case 'consent_expiring':
      return {
        icon: ShieldAlert,
        color: 'text-orange-600 dark:text-orange-400',
        bg: 'bg-orange-500/15',
      };
    case 'sync_error':
      return {
        icon: RefreshCw,
        color: 'text-rose-600 dark:text-rose-400',
        bg: 'bg-rose-500/15',
      };
    case 'price_hike':
      return {
        icon: ArrowUpRight,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/15',
      };
    case 'cancelled_subscription':
      return {
        icon: CalendarX,
        color: 'text-muted-foreground',
        bg: 'bg-muted',
      };
    case 'unusual_expense':
    default:
      return {
        icon: Sparkles,
        color: 'text-purple-600 dark:text-purple-400',
        bg: 'bg-purple-500/15',
      };
  }
}

export function NotificationItem({
  notification,
  compact = false,
}: NotificationItemProps) {
  const [isPending, startTransition] = React.useTransition();
  const { icon: Icon, color, bg } = getNotificationIcon(notification.type);

  function handleMarkRead(e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (notification.isRead || isPending) return;

    startTransition(async () => {
      const res = await markNotificationReadAction({ notificationId: notification.id });
      if (!res.ok) toast.error(res.error.message || 'Erro ao marcar notificação como lida');
    });
  }

  const content = (
    <div
      className={cn(
        'group relative flex items-start gap-3 rounded-lg p-3 transition-colors',
        !notification.isRead
          ? 'bg-primary/5 hover:bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-muted/50 text-muted-foreground',
        compact ? 'text-xs' : 'text-sm',
      )}
    >
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', bg, color)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'font-medium truncate',
              !notification.isRead ? 'text-foreground font-semibold' : 'text-muted-foreground',
            )}
          >
            {notification.title}
          </p>
          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
            {notification.timeAgo}
          </span>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>

        {notification.actionUrl && (
          <div className="pt-0.5 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
            <span>Ver detalhes</span>
            <ExternalLink className="h-3 w-3" />
          </div>
        )}
      </div>

      {!notification.isRead && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMarkRead}
          disabled={isPending}
          className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100"
          title="Marcar como lida"
        >
          <Check className="h-3.5 w-3.5" />
          <span className="sr-only">Marcar como lida</span>
        </Button>
      )}
    </div>
  );

  if (notification.actionUrl) {
    return (
      <Link
        href={notification.actionUrl}
        onClick={() => {
          if (!notification.isRead) {
            handleMarkRead();
          }
        }}
        className="block"
      >
        {content}
      </Link>
    );
  }

  return content;
}
