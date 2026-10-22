import { desc, isNull, sql } from 'drizzle-orm';
import { formatDistanceToNow, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Db } from '@/server/db/client';
import { notificationPreferences, notifications } from '@/server/db/schema';
import { NOTIFICATION_TYPES, type NotificationType } from '@/server/domain/enums';
import { NOTIFICATION_TYPE_LABELS } from '@/server/domain/labels';
import { pushEnabledFor } from '@/server/push/defaults';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  readAt: string | null;
  isRead: boolean;
  createdAt: string;
  timeAgo: string; // ex.: 'há 10 min', 'ontem'
};

export type NotificationPreferenceRow = {
  type: NotificationType;
  label: string;
  description: string;
  enabled: boolean;
  inApp: boolean;
  push: boolean;
  telegram: boolean;
};

const NOTIFICATION_DESCRIPTIONS: Record<NotificationType, string> = {
  threshold_80: 'Avisos quando os gastos atingirem 80% do teto definido na meta',
  threshold_100: 'Alerta imediato quando uma meta de gastos for ultrapassada',
  pace_warning: 'Projeção linear que indica se o limite será estourado no ritmo atual',
  unusual_expense: 'Transações com valores atipicamente altos para a respectiva categoria',
  invoice_due_soon: 'Lembrete de faturas com vencimento nos próximos 3 dias',
  consent_expiring: 'Avisos sobre conexões do Open Finance próximas de expirar (15 dias)',
  sync_error: 'Falhas de comunicação ou autenticação nas conexões bancárias',
  price_hike: 'Identificação de aumentos de preço em assinaturas e recorrências',
  cancelled_subscription: 'Cobranças de assinaturas esperadas que deixaram de ocorrer',
};

export async function listNotifications(
  db: Db,
  opts?: { unreadOnly?: boolean; limit?: number },
): Promise<{ items: NotificationRow[]; unreadCount: number }> {
  // 1. Contagem de não lidas
  const [countRow] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(notifications)
    .where(isNull(notifications.readAt));

  const unreadCount = Number(countRow?.count ?? 0);

  // 2. Consulta de itens
  let query = db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      actionUrl: notifications.actionUrl,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .$dynamic();

  if (opts?.unreadOnly) {
    query = query.where(isNull(notifications.readAt));
  }

  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const rows = await query;

  const items: NotificationRow[] = rows.map((r) => {
    const isRead = Boolean(r.readAt);
    const readAtIso = r.readAt instanceof Date ? r.readAt.toISOString() : (r.readAt ?? null);
    const createdAtDate = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
    const createdAtIso = createdAtDate.toISOString();
    const timeAgo = isValid(createdAtDate)
      ? formatDistanceToNow(createdAtDate, { addSuffix: true, locale: ptBR })
      : '';

    return {
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      actionUrl: r.actionUrl,
      readAt: readAtIso,
      isRead,
      createdAt: createdAtIso,
      timeAgo,
    };
  });

  return { items, unreadCount };
}

export async function getNotificationPreferences(db: Db): Promise<NotificationPreferenceRow[]> {
  const storedPrefs = await db.select().from(notificationPreferences);
  const prefsMap = new Map(storedPrefs.map((p) => [p.type, p]));

  return NOTIFICATION_TYPES.map((type) => {
    const stored = prefsMap.get(type);
    const enabled = stored?.enabled ?? true;
    return {
      type,
      label: NOTIFICATION_TYPE_LABELS[type] || type,
      description: NOTIFICATION_DESCRIPTIONS[type] || '',
      enabled,
      inApp: stored?.inApp ?? true,
      push: pushEnabledFor(
        type,
        stored ? { enabled: stored.enabled, push: stored.push } : undefined,
      ),
      telegram: stored?.telegram ?? false,
    };
  });
}
