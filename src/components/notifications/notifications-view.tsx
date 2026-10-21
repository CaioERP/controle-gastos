'use client';

import * as React from 'react';
import { Bell, CheckCheck, Settings2, BellOff } from 'lucide-react';
import { isToday, isThisWeek, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/states/empty-state';
import { NotificationItem } from './notification-item';
import { NotificationPreferencesDialog } from './notification-preferences-dialog';
import type { NotificationPreferenceRow, NotificationRow } from '@/server/queries/notifications';
import { markAllNotificationsReadAction } from '@/app/(app)/notificacoes/actions';

type NotificationsViewProps = {
  initialNotifications: NotificationRow[];
  initialUnreadCount: number;
  initialPreferences: NotificationPreferenceRow[];
};

type TabFilter = 'all' | 'unread';

export function NotificationsView({
  initialNotifications,
  initialUnreadCount,
  initialPreferences,
}: NotificationsViewProps) {
  const [tab, setTab] = React.useState<TabFilter>('all');
  const [prefsOpen, setPrefsOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  // Dados vindos do servidor; as Server Actions revalidam o layout, então não há estado otimista.
  const items = initialNotifications;
  const unreadCount = initialUnreadCount;

  function handleMarkAllRead() {
    startTransition(async () => {
      try {
        const res = await markAllNotificationsReadAction();
        if (res.ok) {
          toast.success('Todas as notificações foram marcadas como lidas');
        } else {
          toast.error('Erro ao marcar notificações como lidas');
        }
      } catch {
        toast.error('Erro de conexão ao marcar notificações');
      }
    });
  }

  const filteredItems = React.useMemo(() => {
    if (tab === 'unread') return items.filter((n) => !n.isRead);
    return items;
  }, [items, tab]);

  // Agrupamento por períodos
  const groups = React.useMemo(() => {
    const todayItems: NotificationRow[] = [];
    const weekItems: NotificationRow[] = [];
    const olderItems: NotificationRow[] = [];

    for (const item of filteredItems) {
      const d = parseISO(item.createdAt);
      if (isToday(d)) {
        todayItems.push(item);
      } else if (isThisWeek(d, { weekStartsOn: 1 })) {
        weekItems.push(item);
      } else {
        olderItems.push(item);
      }
    }

    return [
      { title: 'Hoje', items: todayItems },
      { title: 'Esta semana', items: weekItems },
      { title: 'Anteriores', items: olderItems },
    ].filter((g) => g.items.length > 0);
  }, [filteredItems]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description="Acompanhe alertas de orçamento, ritmo de gasto, faturas e conexões."
        actions={
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="gap-1.5 text-xs"
                data-testid="mark-all-read-page-btn"
              >
                <CheckCheck className="h-4 w-4" />
                <span>Marcar todas como lidas</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrefsOpen(true)}
              className="gap-1.5 text-xs"
              data-testid="open-prefs-page-btn"
            >
              <Settings2 className="h-4 w-4" />
              <span>Preferências</span>
            </Button>
          </div>
        }
      />

      {/* Abas: Todas e Não lidas */}
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`text-sm font-medium pb-2 transition-colors border-b-2 -mb-2.5 px-1 ${
              tab === 'all'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Todas ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('unread')}
            className={`text-sm font-medium pb-2 transition-colors border-b-2 -mb-2.5 px-1 flex items-center gap-1.5 ${
              tab === 'unread'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Não lidas</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-xs font-semibold text-primary">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Lista com agrupamento */}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={tab === 'unread' ? BellOff : Bell}
          title={
            tab === 'unread'
              ? 'Tudo em dia!'
              : 'Nenhuma notificação encontrada'
          }
          description={
            tab === 'unread'
              ? 'Você não possui notificações pendentes de leitura no momento.'
              : 'Novos alertas e notificações sobre suas contas e metas aparecerão aqui.'
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.title} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
              <div className="rounded-xl border bg-card divide-y divide-border/60 overflow-hidden shadow-2xs">
                {group.items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Diálogo de Preferências */}
      <NotificationPreferencesDialog
        open={prefsOpen}
        onOpenChange={setPrefsOpen}
        preferences={initialPreferences}
      />
    </div>
  );
}
