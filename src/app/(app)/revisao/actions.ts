'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { markReviewed, recategorize, updateTransaction } from '@/server/commands';
import { listReviewQueue } from '@/server/queries/review';
import { runAction } from '@/lib/action';

export async function recategorizeAction(input: Parameters<typeof recategorize>[1]) {
  const result = await runAction(() => recategorize(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

const kindInput = z.object({
  transactionId: z.string().uuid(),
  kind: z.enum(['transfer', 'invoice_payment']),
});

/** "É transferência / pagamento de fatura": troca a natureza (marcada como edição do usuário, R9) e tira da fila. */
export async function setKindAndReviewAction(input: z.infer<typeof kindInput>) {
  const result = await runAction(async () => {
    const { transactionId, kind } = kindInput.parse(input);
    const db = getDb();
    await updateTransaction(db, { transactionId, patch: { kind } });
    return markReviewed(db, { transactionIds: [transactionId] });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function markReviewedAction(input: Parameters<typeof markReviewed>[1]) {
  const result = await runAction(() => markReviewed(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** Leitura: próxima página da fila (30 por vez). */
export async function loadMoreReviewAction(cursor: string) {
  return runAction(async () => {
    const c = z.string().min(1).max(200).parse(cursor);
    return listReviewQueue(getDb(), { cursor: c, limit: 30 });
  });
}
