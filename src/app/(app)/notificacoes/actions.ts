'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import {
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
  type UpdateNotificationPreferencesInput,
} from '@/server/commands/notifications';
import {
  getNotificationPreferences,
  listNotifications,
} from '@/server/queries/notifications';
import { runAction } from '@/lib/action';

function revalidateNotifications() {
  revalidatePath('/', 'layout');
}

export async function markNotificationReadAction(input: { notificationId: string }) {
  const result = await runAction(() => markNotificationRead(getDb(), input));
  if (result.ok) revalidateNotifications();
  return result;
}

export async function markAllNotificationsReadAction() {
  const result = await runAction(() => markAllNotificationsRead(getDb()));
  if (result.ok) revalidateNotifications();
  return result;
}

export async function updateNotificationPreferencesAction(input: UpdateNotificationPreferencesInput) {
  const result = await runAction(() => updateNotificationPreferences(getDb(), input));
  if (result.ok) revalidateNotifications();
  return result;
}

export async function getRecentNotificationsAction(limit: number = 10) {
  return runAction(() => listNotifications(getDb(), { limit }));
}

export async function getNotificationPreferencesAction() {
  return runAction(() => getNotificationPreferences(getDb()));
}
