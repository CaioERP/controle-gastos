'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { recurrences } from '@/server/db/schema';
import {
  deleteRecurrence,
  upsertRecurrence,
  type UpsertRecurrenceInput,
} from '@/server/commands/recurrences';
import type { RecurrenceStatus } from '@/server/domain/enums';
import { CommandError } from '@/server/domain/errors';
import { runAction } from '@/lib/action';

function revalidateRecurrences() {
  revalidatePath('/assinaturas');
  revalidatePath('/');
}

export async function upsertRecurrenceAction(input: UpsertRecurrenceInput) {
  const result = await runAction(() => upsertRecurrence(getDb(), input));
  if (result.ok) revalidateRecurrences();
  return result;
}

export async function deleteRecurrenceAction(input: { recurrenceId: string }) {
  const result = await runAction(() => deleteRecurrence(getDb(), input));
  if (result.ok) revalidateRecurrences();
  return result;
}

export async function toggleRecurrenceStatusAction(input: {
  recurrenceId: string;
  status: RecurrenceStatus;
}) {
  const result = await runAction(async () => {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, input.recurrenceId));
    if (!existing) {
      throw new CommandError('NOT_FOUND', 'Recorrência não encontrada');
    }

    return upsertRecurrence(db, {
      id: existing.id,
      description: existing.description,
      merchantId: existing.merchantId,
      categoryId: existing.categoryId,
      accountId: existing.accountId,
      paymentMethod: existing.paymentMethod,
      frequency: existing.frequency,
      expectedDay: existing.expectedDay,
      amountCents: existing.amountCents,
      tolerancePercent: existing.tolerancePercent,
      status: input.status,
      isSubscription: existing.isSubscription,
      firstDate: existing.firstDate,
      lastDate: existing.lastDate,
      lastAmountCents: existing.lastAmountCents,
      autoDetected: existing.autoDetected,
    });
  });
  if (result.ok) revalidateRecurrences();
  return result;
}
