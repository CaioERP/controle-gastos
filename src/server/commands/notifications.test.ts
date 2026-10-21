import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { notificationPreferences, notifications } from '../db/schema';
import { seedBase } from '../db/seed';
import { CommandError } from '../domain/errors';
import {
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from './notifications';

describe('notifications commands (A4-02)', () => {
  it('marca notificação como lida e valida id inexistente', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [notif] = await db
      .insert(notifications)
      .values({
        type: 'threshold_80',
        title: 'Limite quase estourado',
        message: 'Você atingiu 80% do limite',
        channel: 'in_app',
      })
      .returning();

    expect(notif!.readAt).toBeNull();

    await markNotificationRead(db, { notificationId: notif!.id });

    const [updated] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notif!.id));
    expect(updated!.readAt).not.toBeNull();

    await expect(
      markNotificationRead(db, {
        notificationId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(CommandError);
  });

  it('marca todas as notificações pendentes como lidas', async () => {
    const db = await createTestDb();
    await seedBase(db);

    await db.insert(notifications).values([
      {
        type: 'threshold_80',
        title: 'N1',
        message: 'M1',
        channel: 'in_app',
      },
      {
        type: 'threshold_100',
        title: 'N2',
        message: 'M2',
        channel: 'in_app',
      },
    ]);

    const res = await markAllNotificationsRead(db);
    expect(res.updated).toBe(2);

    const unread = await db
      .select()
      .from(notifications)
      .where(eq(notifications.readAt, null as never));
    expect(unread).toHaveLength(0);
  });

  it('atualiza preferências de notificações de forma idempotente', async () => {
    const db = await createTestDb();
    await seedBase(db);

    await updateNotificationPreferences(db, {
      preferences: [
        {
          type: 'threshold_80',
          enabled: false,
          inApp: false,
          telegram: true,
        },
        {
          type: 'invoice_due_soon',
          enabled: true,
          inApp: true,
        },
      ],
    });

    const prefs = await db.select().from(notificationPreferences);
    expect(prefs).toHaveLength(2);

    const p80 = prefs.find((p) => p.type === 'threshold_80');
    expect(p80!.enabled).toBe(false);
    expect(p80!.inApp).toBe(false);
    expect(p80!.telegram).toBe(true);

    // Atualiza novamente
    await updateNotificationPreferences(db, {
      preferences: [
        {
          type: 'threshold_80',
          enabled: true,
          inApp: true,
          telegram: false,
        },
      ],
    });

    const [p80Updated] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.type, 'threshold_80'));
    expect(p80Updated!.enabled).toBe(true);
    expect(p80Updated!.inApp).toBe(true);
    expect(p80Updated!.telegram).toBe(false);
  });
});
