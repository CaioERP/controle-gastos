import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { transactions, transactionTags } from '@/server/db/schema';
import { PAYMENT_METHODS, TX_KINDS } from '@/server/domain/enums';
import { CommandError } from '@/server/domain/errors';

/** Adiciona campos a user_edited_fields sem duplicar (regra R9). */
export function markEdited(fields: string[]) {
  let expr = sql`${transactions.userEditedFields}`;
  for (const f of fields) expr = sql`array_append(array_remove(${expr}, ${f}), ${f})`;
  return expr;
}

const recategorizeInput = z.object({
  transactionId: z.string().uuid(),
  categoryId: z.string().uuid(),
  scope: z.enum(['this', 'similar', 'rule']),
});

/**
 * STUB (F0-03): aplica só na transação informada, para qualquer scope.
 * A lógica de 'similar' e 'rule' é implementada em A1-08.
 */
export async function recategorize(db: Db, input: z.infer<typeof recategorizeInput>) {
  const { transactionId, categoryId } = recategorizeInput.parse(input);
  const updated = await db
    .update(transactions)
    .set({
      categoryId,
      categorySource: 'user',
      categoryConfidence: 1,
      needsReview: false,
      userEditedFields: markEdited(['category']),
    })
    .where(eq(transactions.id, transactionId))
    .returning({ id: transactions.id });
  if (updated.length === 0) throw new CommandError('NOT_FOUND', 'Transação não encontrada');
  return { updated: updated.length, ruleId: null as string | null };
}

const updateTransactionInput = z.object({
  transactionId: z.string().uuid(),
  patch: z.object({
    description: z.string().min(1).max(200).optional(),
    kind: z.enum(TX_KINDS).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    notes: z.string().max(1000).nullable().optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  }),
});

export async function updateTransaction(db: Db, input: z.infer<typeof updateTransactionInput>) {
  const { transactionId, patch } = updateTransactionInput.parse(input);
  const { tagIds, ...fields } = patch;
  const editedFields = Object.keys(fields);
  await db.transaction(async (tx) => {
    if (editedFields.length > 0) {
      const res = await tx
        .update(transactions)
        .set({ ...fields, userEditedFields: markEdited(editedFields) })
        .where(eq(transactions.id, transactionId))
        .returning({ id: transactions.id });
      if (res.length === 0) throw new CommandError('NOT_FOUND', 'Transação não encontrada');
    } else {
      // Check existence
      const [existing] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, transactionId));
      if (!existing) throw new CommandError('NOT_FOUND', 'Transação não encontrada');
    }
    if (tagIds !== undefined) {
      await tx.delete(transactionTags).where(eq(transactionTags.transactionId, transactionId));
      if (tagIds.length > 0) {
        await tx.insert(transactionTags).values(tagIds.map((tagId) => ({ transactionId, tagId })));
      }
    }
  });
}

export async function markReviewed(db: Db, input: { transactionIds: string[] }) {
  const ids = z.array(z.string().uuid()).min(1).parse(input.transactionIds);
  const res = await db
    .update(transactions)
    .set({ needsReview: false })
    .where(and(inArray(transactions.id, ids)))
    .returning({ id: transactions.id });
  return { updated: res.length };
}
