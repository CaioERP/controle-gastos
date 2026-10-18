'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import { updateAccount } from '@/server/commands';
import { runAction } from '@/lib/action';

export async function updateAccountAction(input: Parameters<typeof updateAccount>[1]) {
  const result = await runAction(() => updateAccount(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}
