'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { archiveCategory, deleteRule, updateMerchant, upsertCategory, upsertRule } from '@/server/commands';
import { getRulePreview, type RulePreviewInput } from '@/server/queries/rule-preview';
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

const rulePreviewInput = z.object({
  matchField: z.enum(['description', 'merchant']),
  matchType: z.enum(['contains', 'starts_with', 'equals', 'regex']),
  pattern: z.string().max(500),
  accountId: z.string().uuid().nullable(),
  amountMinCents: z.number().int().nonnegative().nullable(),
  amountMaxCents: z.number().int().nonnegative().nullable(),
});

/** Prévia do formulário de regra ("casaria com N transações"): só leitura, não revalida nada. */
export async function previewRuleAction(input: RulePreviewInput) {
  return runAction(() => getRulePreview(getDb(), rulePreviewInput.parse(input)));
}
