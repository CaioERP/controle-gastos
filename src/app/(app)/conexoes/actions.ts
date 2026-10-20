'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import { triggerSync, registerConnection, reconnectConnection } from '@/server/commands';
import { runAction } from '@/lib/action';

export async function triggerSyncAction(input: Parameters<typeof triggerSync>[1]) {
  const result = await runAction(() => triggerSync(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function registerConnectionAction(input: Parameters<typeof registerConnection>[1]) {
  const result = await runAction(() => registerConnection(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function reconnectConnectionAction(input: Parameters<typeof reconnectConnection>[1]) {
  const result = await runAction(() => reconnectConnection(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}
