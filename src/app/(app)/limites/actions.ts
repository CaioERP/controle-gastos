'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import {
  deleteSpendingLimit,
  setSpendingLimitActive,
  upsertSpendingLimit,
  type UpsertSpendingLimitInput,
} from '@/server/commands/limits';
import { runAction } from '@/lib/action';

function revalidateLimits() {
  revalidatePath('/limites');
  revalidatePath('/');
}

export async function upsertSpendingLimitAction(input: UpsertSpendingLimitInput) {
  const result = await runAction(() => upsertSpendingLimit(getDb(), input));
  if (result.ok) revalidateLimits();
  return result;
}

export async function deleteSpendingLimitAction(input: { limitId: string }) {
  const result = await runAction(() => deleteSpendingLimit(getDb(), input));
  if (result.ok) revalidateLimits();
  return result;
}

export async function toggleSpendingLimitActiveAction(input: {
  limitId: string;
  isActive: boolean;
}) {
  const result = await runAction(() =>
    setSpendingLimitActive(getDb(), { id: input.limitId, isActive: input.isActive }),
  );
  if (result.ok) revalidateLimits();
  return result;
}

export async function acceptSuggestedBudgetAction(input: {
  categoryId: string;
  categoryName: string;
  amountCents: number;
}) {
  const result = await runAction(async () => {
    const db = getDb();
    return upsertSpendingLimit(db, {
      name: input.categoryName,
      categoryId: input.categoryId,
      period: 'monthly',
      amountCents: input.amountCents,
      thresholds: [80, 100],
      notifyPace: true,
      isActive: true,
    });
  });
  if (result.ok) revalidateLimits();
  return result;
}
