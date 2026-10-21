'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import {
  confirmFileImport,
  discardFileImport,
  previewFileImport,
} from '@/server/commands/imports';
import { runAction } from '@/lib/action';

export async function previewFileImportAction(input: {
  accountId: string;
  filename: string;
  content: string;
}) {
  const result = await runAction(() => previewFileImport(getDb(), input));
  if (result.ok) {
    revalidatePath('/importar');
  }
  return result;
}

export async function confirmFileImportAction(
  input: Parameters<typeof confirmFileImport>[1],
) {
  const result = await runAction(() => confirmFileImport(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function discardFileImportAction(input: { batchId: string }) {
  const result = await runAction(() => discardFileImport(getDb(), input));
  if (result.ok) {
    revalidatePath('/importar');
  }
  return result;
}
