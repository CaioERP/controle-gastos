import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import webpush from 'web-push';
import type { Db } from '@/server/db/client';
import { notificationPreferences, notifications, pushSubscriptions } from '@/server/db/schema';
import type { NotificationType } from '@/server/domain/enums';
import { pushEnabledFor } from './defaults';
import { ensureVapidConfigured, pushConfigured } from './vapid';
import { logServerError } from '@/server/log';

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export function toPayload(n: {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
}): PushPayload {
  return {
    title: n.title,
    body: n.message,
    url: n.actionUrl ?? '/notificacoes',
    tag: n.type,
  };
}

export async function sendPendingPush(
  db: Db,
  opts: { now?: Date } = {},
): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) {
    return { sent: 0, removed: 0 };
  }

  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Notificações não enviadas das últimas 24h
  const pending = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      actionUrl: notifications.actionUrl,
    })
    .from(notifications)
    .where(
      and(
        isNull(notifications.pushSentAt),
        gte(notifications.createdAt, since),
      ),
    );

  if (pending.length === 0) {
    return { sent: 0, removed: 0 };
  }

  // 2. Preferências salvas
  const prefRows = await db.select().from(notificationPreferences);
  const prefs = new Map<NotificationType, { enabled: boolean; push: boolean }>(
    prefRows.map((p) => [p.type, { enabled: p.enabled, push: p.push }]),
  );

  // Marcar todas como processadas para não reenviar em lote futuro
  const pendingIds = pending.map((n) => n.id);
  await db
    .update(notifications)
    .set({ pushSentAt: now })
    .where(inArray(notifications.id, pendingIds));

  // Filtrar apenas os tipos com push ativado
  const eligible = pending.filter((n) =>
    pushEnabledFor(n.type, prefs.get(n.type)),
  );

  if (eligible.length === 0) {
    return { sent: 0, removed: 0 };
  }

  const subs = await db.select().from(pushSubscriptions);
  if (subs.length === 0) {
    return { sent: 0, removed: 0 };
  }

  ensureVapidConfigured();

  let sent = 0;
  let removed = 0;
  const removedSubIds = new Set<string>();

  for (const notif of eligible) {
    const payload = JSON.stringify(toPayload(notif));

    for (const sub of subs) {
      if (removedSubIds.has(sub.id)) continue;

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
        await db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: now })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          removed++;
          removedSubIds.add(sub.id);
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
        } else {
          logServerError('push', err, { action: 'sendNotification' });
        }
      }
    }
  }

  return { sent, removed };
}
