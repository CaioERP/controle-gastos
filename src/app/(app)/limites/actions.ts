'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { spendingLimits } from '@/server/db/schema';
import {
  deleteSpendingLimit,
  upsertSpendingLimit,
  type UpsertSpendingLimitInput,
} from '@/server/commands/limits';
import { CommandError } from '@/server/domain/errors';
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
  const result = await runAction(async () => {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(spendingLimits)
      .where(eq(spendingLimits.id, input.limitId));
    if (!existing) {
      throw new CommandError('NOT_FOUND', 'Limite de gastos não encontrado');
    }
    return upsertSpendingLimit(db, {
      id: existing.id,
      name: existing.name,
      categoryId: existing.categoryId,
      paymentMethod: existing.paymentMethod,
      accountId: existing.accountId,
      period: existing.period,
      amountCents: existing.amountCents,
      thresholds: existing.thresholds,
      notifyPace: existing.notifyPace,
      isActive: input.isActive,
    });
  });
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
