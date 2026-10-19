'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { markReviewed, recategorize, updateTransaction } from '@/server/commands';
import { listReviewQueue } from '@/server/queries/review';
import { runAction } from '@/lib/action';
import { CommandError } from '@/server/domain/errors';

export async function recategorizeAction(input: Parameters<typeof recategorize>[1]) {
  const result = await runAction(() => recategorize(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

const kindInput = z.object({
  transactionId: z.string().uuid(),
  kind: z.enum(['transfer', 'invoice_payment']),
});

/**
 * "É transferência / pagamento de fatura": troca a natureza (edição do usuário, R9) e tira da fila,
 * na mesma action. Os comandos não têm uma versão conjunta (trilha A), então, se a 2ª etapa falhar,
 * devolvemos um erro que diz exatamente o que ficou feito. Repetir é seguro (as duas etapas são idempotentes).
 */
export async function setKindAndReviewAction(input: z.infer<typeof kindInput>) {
  let kindChanged = false;
  const result = await runAction(async () => {
    const { transactionId, kind } = kindInput.parse(input);
    const db = getDb();
    await updateTransaction(db, { transactionId, patch: { kind } });
    kindChanged = true;
    try {
      const res = await markReviewed(db, { transactionIds: [transactionId] });
      if (res.updated === 0) throw new Error('nenhuma linha marcada');
      return res;
    } catch {
      throw new CommandError(
        'CONFLICT',
        'A natureza foi alterada, mas a transação continua na fila de revisão. Tente de novo.',
      );
    }
  });
  // Mesmo na falha parcial a natureza mudou: atualiza a tela para refletir.
  if (result.ok || kindChanged) revalidatePath('/', 'layout');
  return result;
}

/** Lote: confirma uma sugestão sem revalidar; a tela recarrega uma vez só no fim do lote. */
export async function confirmSuggestionAction(input: { transactionId: string; categoryId: string }) {
  return runAction(() => recategorize(getDb(), { ...input, scope: 'this' }));
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
