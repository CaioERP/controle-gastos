'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import { captureNetWorthSnapshot } from '@/server/commands';
import { runAction } from '@/lib/action';

export async function captureNetWorthSnapshotAction() {
  const result = await runAction(() => captureNetWorthSnapshot(getDb()));
  if (result.ok) {
    revalidatePath('/patrimonio');
    revalidatePath('/', 'layout');
  }
  return result;
}
