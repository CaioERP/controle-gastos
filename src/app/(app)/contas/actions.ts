'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import { createManualAccount, updateAccount } from '@/server/commands';
import { runAction } from '@/lib/action';

export async function updateAccountAction(input: Parameters<typeof updateAccount>[1]) {
  const result = await runAction(() => updateAccount(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function createManualAccountAction(input: Parameters<typeof createManualAccount>[1]) {
  const result = await runAction(() => createManualAccount(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}