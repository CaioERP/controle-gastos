'use client';

import * as React from 'react';
import Link from 'next/link';
import { Settings2, CheckCheck, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NotificationItem } from './notification-item';
import { NotificationPreferencesDialog } from './notification-preferences-dialog';
import type { NotificationPreferenceRow, NotificationRow } from '@/server/queries/notifications';
import { markAllNotificationsReadAction } from '@/app/(app)/notificacoes/actions';

type NotificationsPopoverProps = {
  trigger: React.ReactNode;
  unreadCount?: number;
  initialNotifications?: NotificationRow[];
  preferences?: NotificationPreferenceRow[];
};

export function NotificationsPopover({
  trigger,
  unreadCount = 0,
  initialNotifications = [],
  preferences = [],
}: NotificationsPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  const [readIds, setReadIds] = React.useState<Set<string>>(new Set());
  const [allRead, setAllRead] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const items = React.useMemo(() => {
    return initialNotifications.map((n) => {
      if (allRead || readIds.has(n.id)) {
        return { ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() };
      }
      return n;
    });
  }, [initialNotifications, allRead, readIds]);

  const effectiveCount = allRead
    ? 0
    : Math.max(
        0,
        unreadCount -
          Array.from(readIds).filter(
            (id) => initialNotifications.find((n) => n.id === id && !n.isRead),
          ).length,
      );

  function handleMarkAllRead() {
    startTransition(async () => {
      try {
        const res = await markAllNotificationsReadAction();
        if (res.ok) {
          setAllRead(true);
          toast.success('Todas as notificações foram marcadas como lidas');
        } else {
          toast.error('Erro ao marcar notificações como lidas');
        }
      } catch {
        toast.error('Erro de conexão ao marcar notificações');
      }
    });
  }

  function handleItemRead(id: string) {
    setReadIds((prev) => new Set([...prev, id]));
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={trigger as React.ReactElement} />
        <PopoverContent
          align="end"
          className="w-80 sm:w-96 p-0 overflow-hidden shadow-lg border border-border"
          data-testid="notifications-popover-content"
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Notificações</span>
              {effectiveCount > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {effectiveCount} {effectiveCount === 1 ? 'nova' : 'novas'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {effectiveCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  disabled={isPending}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                  title="Marcar todas como lidas"
                  data-testid="mark-all-read-btn"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Marcar lidas</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setPrefsOpen(true);
                }}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title="Preferências de alertas"
                data-testid="open-prefs-btn"
              >
                <Settings2 className="h-4 w-4" />
                <span className="sr-only">Preferências</span>
              </Button>
            </div>
          </div>

          {/* Lista de Notificações */}
          <ScrollArea className="max-h-[360px] p-2">
            {items.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="mx-auto h-8 w-8 opacity-30 mb-2" />
                <p className="text-xs">Nenhuma notificação recente</p>
              </div>
            ) : (
              <div className="space-y-1">
                {items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onReadChanged={handleItemRead}
                    compact
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Rodapé com link */}
          <div className="border-t bg-muted/20 p-2 text-center">
            <Link
              href="/notificacoes"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline block py-1"
            >
              Ver todas as notificações
            </Link>
          </div>
        </PopoverContent>
      </Popover>

      {/* Modal de Preferências */}
      <NotificationPreferencesDialog
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
        preferences={preferences}
      />
    </>
  );
}
