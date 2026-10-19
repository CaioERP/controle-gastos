'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import { archiveCategory, deleteRule, updateMerchant, upsertCategory, upsertRule } from '@/server/commands';
import { runAction } from '@/lib/action';

// Categorias, regras e estabelecimentos aparecem em filtros e listas de todas as telas
function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function upsertCategoryAction(input: Parameters<typeof upsertCategory>[1]) {
  const result = await runAction(() => upsertCategory(getDb(), input));
  if (result.ok) revalidateAll();
  return result;
}

export async function archiveCategoryAction(input: Parameters<typeof archiveCategory>[1]) {
  const result = await runAction(() => archiveCategory(getDb(), input));
  if (result.ok) revalidateAll();
  return result;
}

export async function upsertRuleAction(input: Parameters<typeof upsertRule>[1]) {
  const result = await runAction(() => upsertRule(getDb(), input));
  if (result.ok) revalidateAll();
  return result;
}

export async function deleteRuleAction(input: Parameters<typeof deleteRule>[1]) {
  const result = await runAction(() => deleteRule(getDb(), input));
  if (result.ok) revalidateAll();
  return result;
}

export async function updateMerchantAction(input: Parameters<typeof updateMerchant>[1]) {
  const result = await runAction(() => updateMerchant(getDb(), input));
  if (result.ok) revalidateAll();
  return result;
}
