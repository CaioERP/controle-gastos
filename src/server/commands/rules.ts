import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { categorizationRules } from '@/server/db/schema';
import { PAYMENT_METHODS, TX_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';

export type RuleInput = {
  id?: string;
  priority: number;
  matchField: 'description' | 'merchant';
  matchType: 'contains' | 'starts_with' | 'equals' | 'regex';
  pattern: string;
  accountId: string | null;
  amountMinCents: number | null;
  amountMaxCents: number | null;
  setCategoryId: string;
  setKind: TxKind | null;
  setPaymentMethod: PaymentMethod | null;
  enabled: boolean;
};

const ruleInputSchema = z.object({
  id: z.string().uuid().optional(),
  priority: z.number().int().default(0),
  matchField: z.enum(['description', 'merchant']),
  matchType: z.enum(['contains', 'starts_with', 'equals', 'regex']),
  pattern: z.string().min(1),
  accountId: z.string().uuid().nullable(),
  amountMinCents: z.number().int().nullable(),
  amountMaxCents: z.number().int().nullable(),
  setCategoryId: z.string().uuid(),
  setKind: z.enum(TX_KINDS).nullable(),
  setPaymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  enabled: z.boolean().default(true),
});

export async function upsertRule(
  db: Db,
  input: RuleInput,
): Promise<{ id: string; applied: number }> {
  const data = ruleInputSchema.parse(input);

  if (data.matchType === 'regex') {
    try {
      new RegExp(data.pattern);
    } catch {
      throw new CommandError('VALIDATION', 'Expressão regular inválida no padrão da regra');
    }
  }

  if (data.amountMinCents !== null && data.amountMaxCents !== null) {
    if (data.amountMinCents > data.amountMaxCents) {
      throw new CommandError('VALIDATION', 'amountMinCents deve ser menor ou igual a amountMaxCents');
    }
  }

  try {
    if (data.id) {
      const { id, ...fields } = data;
      const res = await db
        .update(categorizationRules)
        .set(fields)
        .where(eq(categorizationRules.id, id))
        .returning({ id: categorizationRules.id });
      if (res.length === 0) throw new CommandError('NOT_FOUND', 'Regra não encontrada');
      return { id: res[0]!.id, applied: 0 };
    }

    const [created] = await db.insert(categorizationRules).values(data).returning({ id: categorizationRules.id });
    return { id: created!.id, applied: 0 };
  } catch (err) {
    throw toCommandError(err);
  }
}

const deleteRuleInput = z.object({
  ruleId: z.string().uuid(),
});

export async function deleteRule(db: Db, input: z.infer<typeof deleteRuleInput>): Promise<void> {
  const { ruleId } = deleteRuleInput.parse(input);
  const res = await db
    .delete(categorizationRules)
    .where(eq(categorizationRules.id, ruleId))
    .returning({ id: categorizationRules.id });
  if (res.length === 0) throw new CommandError('NOT_FOUND', 'Regra não encontrada');
}
