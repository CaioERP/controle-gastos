import type { NewTransaction, Transaction } from '@/server/domain/types';
import type { NormalizedTransaction } from './types';

export type MergePolicy =
  | 'replace'    // mesma fonte (ou Pluggy chegando sobre arquivo): atualiza os campos atualizáveis
  | 'fill-gaps'; // arquivo chegando sobre Pluggy: só preenche o que falta (cartão, parcela)

/** NormalizedTransaction já com merchantId e cardId resolvidos no banco pelos chamadores. */
export type ResolvedIncoming = NormalizedTransaction & {
  merchantId?: string | null;
  cardId?: string | null;
};

export type MergeResult = {
  patch: Partial<NewTransaction>;
  changed: boolean;
};

/**
 * Campos a gravar na transação existente ao receber novos dados de qualquer fonte.
 * Nunca toca campos listados em existing.userEditedFields (R9: correção do usuário é soberana).
 */
export function mergeIncoming(
  existing: Transaction,
  incoming: ResolvedIncoming,
  policy: MergePolicy,
): MergeResult {
  const edited = new Set(existing.userEditedFields ?? []);
  const patch: Partial<NewTransaction> = {};
  let changed = false;

  if (policy === 'replace') {
    const installmentNumber = incoming.installment?.number ?? null;
    const installmentTotal = incoming.installment?.total ?? null;

    const candidates = {
      date: incoming.date,
      amountCents: incoming.amountCents,
      status: incoming.status,
      descriptionRaw: incoming.descriptionRaw,
      description: incoming.description,
      paymentMethod: incoming.paymentMethod,
      installmentNumber,
      installmentTotal,
      providerCategoryId: incoming.providerCategoryId ?? null,
      ...(incoming.merchantId !== undefined ? { merchantId: incoming.merchantId } : {}),
      ...(incoming.cardId !== undefined ? { cardId: incoming.cardId } : {}),
    } as const;

    for (const [key, nextVal] of Object.entries(candidates) as Array<
      [keyof typeof candidates, (typeof candidates)[keyof typeof candidates]]
    >) {
      if (edited.has(key)) continue;
      if (existing[key as keyof Transaction] !== nextVal) {
        (patch as Record<string, unknown>)[key] = nextVal;
        changed = true;
      }
    }
  } else if (policy === 'fill-gaps') {
    // Arquivo chegando sobre Pluggy: só preenche cardId e parcela quando estiverem vazios
    if (!existing.cardId && incoming.cardId && !edited.has('cardId')) {
      patch.cardId = incoming.cardId;
      changed = true;
    }

    if (
      existing.installmentNumber == null &&
      incoming.installment &&
      !edited.has('installmentNumber') &&
      !edited.has('installmentTotal')
    ) {
      patch.installmentNumber = incoming.installment.number;
      patch.installmentTotal = incoming.installment.total;
      changed = true;
    }
  }

  // Nas duas políticas: occurredAt só é preenchido quando está nulo (A6-05)
  if (!existing.occurredAt && incoming.occurredAt && !edited.has('occurredAt')) {
    patch.occurredAt = new Date(incoming.occurredAt);
    changed = true;
  }

  return { patch, changed };
}
