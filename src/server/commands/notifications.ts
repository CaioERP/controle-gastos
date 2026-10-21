import { eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { notificationPreferences, notifications } from '@/server/db/schema';
import { NOTIFICATION_TYPES } from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';

export const markNotificationReadInput = z.object({
  notificationId: z.string().uuid(),
});

export async function markNotificationRead(
  db: Db,
  input: z.infer<typeof markNotificationReadInput>,
): Promise<void> {
  try {
    const data = markNotificationReadInput.parse(input);

    const [existing] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.id, data.notificationId));
    if (!existing) throw new CommandError('NOT_FOUND', 'Notificação não encontrada');

    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, data.notificationId));
  } catch (err) {
    throw toCommandError(err);
  }
}

export async function markAllNotificationsRead(db: Db): Promise<{ updated: number }> {
  try {
    const updatedRows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(isNull(notifications.readAt))
      .returning({ id: notifications.id });

    return { updated: updatedRows.length };
  } catch (err) {
    throw toCommandError(err);
  }
}

export const updateNotificationPreferencesInput = z.object({
  preferences: z.array(
    z.object({
      type: z.enum(NOTIFICATION_TYPES),
      enabled: z.boolean(),
      inApp: z.boolean().optional(),
      email: z.boolean().optional(),
      push: z.boolean().optional(),
      telegram: z.boolean().optional(),
    }),
  ),
});

export type UpdateNotificationPreferencesInput = z.input<
  typeof updateNotificationPreferencesInput
>;

export async function updateNotificationPreferences(
  db: Db,
  input: UpdateNotificationPreferencesInput,
): Promise<void> {
  try {
    const data = updateNotificationPreferencesInput.parse(input);

    for (const pref of data.preferences) {
      await db
        .insert(notificationPreferences)
        .values({
          type: pref.type,
          enabled: pref.enabled,
          inApp: pref.inApp ?? true,
          email: pref.email ?? false,
          push: pref.push ?? false,
          telegram: pref.telegram ?? false,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: notificationPreferences.type,
          set: {
            enabled: pref.enabled,
            inApp: pref.inApp ?? true,
            email: pref.email ?? false,
            push: pref.push ?? false,
            telegram: pref.telegram ?? false,
            updatedAt: new Date(),
          },
        });
    }
  } catch (err) {
    throw toCommandError(err);
  }
}
