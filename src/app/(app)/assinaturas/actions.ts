'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import {
  deleteRecurrence,
  setRecurrenceStatus,
  upsertRecurrence,
  type UpsertRecurrenceInput,
} from '@/server/commands/recurrences';
import type { RecurrenceStatus } from '@/server/domain/enums';
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
  const result = await runAction(() =>
    setRecurrenceStatus(getDb(), { id: input.recurrenceId, status: input.status }),
  );
  if (result.ok) revalidateRecurrences();
  return result;
}
