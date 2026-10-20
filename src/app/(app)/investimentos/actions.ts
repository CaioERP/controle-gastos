'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import { refreshMarketPrices } from '@/server/commands';
import { runAction } from '@/lib/action';

export async function refreshMarketPricesAction() {
  const result = await runAction(() => refreshMarketPrices(getDb()));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}
