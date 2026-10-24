import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { pushSubscriptions } from '@/server/db/schema';
import { CommandError, toCommandError } from '@/server/domain/errors';
import { logServerError } from '@/server/log';
import { ensureVapidConfigured, pushConfigured } from '@/server/push/vapid';

export const savePushSubscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceLabel: z.string().optional(),
});

export type SavePushSubscriptionInput = z.infer<typeof savePushSubscriptionInput>;

export async function savePushSubscription(
  db: Db,
  input: SavePushSubscriptionInput,
): Promise<void> {
  try {
    const data = savePushSubscriptionInput.parse(input);

    await db
      .insert(pushSubscriptions)
      .values({
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        deviceLabel: data.deviceLabel ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh: data.keys.p256dh,
          auth: data.keys.auth,
          deviceLabel: data.deviceLabel ?? null,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    throw toCommandError(err);
  }
}

export const deletePushSubscriptionInput = z.object({
  endpoint: z.string(),
});

export type DeletePushSubscriptionInput = z.infer<typeof deletePushSubscriptionInput>;

export async function deletePushSubscription(
  db: Db,
  input: DeletePushSubscriptionInput | string,
): Promise<void> {
  try {
    const raw = typeof input === 'string' ? { endpoint: input } : input;
    const data = deletePushSubscriptionInput.parse(raw);

    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, data.endpoint));
  } catch (err) {
    throw toCommandError(err);
  }
}

export async function sendTestPush(db: Db): Promise<{ sent: number }> {
  try {
    if (!pushConfigured()) {
      throw new CommandError(
        'VALIDATION',
        'Notificações push não configuradas no servidor (chaves VAPID ausentes)',
      );
    }

    ensureVapidConfigured();

    const subs = await db.select().from(pushSubscriptions);
    if (subs.length === 0) {
      return { sent: 0 };
    }

    const payload = JSON.stringify({
      title: 'Notificações ativadas',
      body: 'Notificações ativadas neste aparelho',
      url: '/notificacoes',
      tag: 'test',
    });

    let sent = 0;
    const now = new Date();

    for (const sub of subs) {
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
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
        } else {
          logServerError('push', err, { action: 'push de teste' });
        }
      }
    }

    return { sent };
  } catch (err) {
    throw toCommandError(err);
  }
}
