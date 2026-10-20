'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import {
  createManualTransaction,
  deleteManualTransaction,
  recategorize,
  splitTransaction,
  unsplitTransaction,
  updateManualTransaction,
  updateTransaction,
  upsertTag,
} from '@/server/commands';
import { txFiltersSchema, type TxFilters } from '@/server/domain/filters';
import {
  getInstallmentGroup,
  getParentTransaction,
  getSplitParts,
  getTransaction,
  listTransactions,
} from '@/server/queries/transactions';
import { getTransactionInvoice } from '@/server/queries/transaction-detail';
import { CommandError } from '@/server/domain/errors';
import { runAction } from '@/lib/action';

export async function recategorizeAction(input: Parameters<typeof recategorize>[1]) {
  const result = await runAction(() => recategorize(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function updateTransactionAction(input: Parameters<typeof updateTransaction>[1]) {
  const result = await runAction(() => updateTransaction(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function upsertTagAction(input: Parameters<typeof upsertTag>[1]) {
  const result = await runAction(() => upsertTag(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function splitTransactionAction(input: Parameters<typeof splitTransaction>[1]) {
  const result = await runAction(() => splitTransaction(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function unsplitTransactionAction(input: Parameters<typeof unsplitTransaction>[1]) {
  const result = await runAction(() => unsplitTransaction(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function createManualTransactionAction(input: Parameters<typeof createManualTransaction>[1]) {
  const result = await runAction(() => createManualTransaction(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function updateManualTransactionAction(input: Parameters<typeof updateManualTransaction>[1]) {
  const result = await runAction(() => updateManualTransaction(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function deleteManualTransactionAction(input: Parameters<typeof deleteManualTransaction>[1]) {
  const result = await runAction(() => deleteManualTransaction(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

const PAGE_SIZE = 100;

/** Leitura: próxima página da lista. Não revalida nada (não há escrita). */
export async function loadMoreAction(filters: TxFilters, cursor: string) {
  return runAction(async () => {
    const f = txFiltersSchema.parse(filters);
    const c = z.string().min(1).max(200).parse(cursor);
    return listTransactions(getDb(), f, { cursor: c, limit: PAGE_SIZE });
  });
}

/** Leitura: detalhe completo para o painel lateral (sem o `raw` das fontes). */
export async function loadTransactionDetailAction(transactionId: string) {
  return runAction(async () => {
    const id = z.string().uuid().parse(transactionId);
    const db = getDb();
    const [detail, invoice] = await Promise.all([getTransaction(db, id), getTransactionInvoice(db, id)]);
    if (!detail) throw new CommandError('NOT_FOUND', 'Transação não encontrada');
    const [installments, splitParts, parentTransaction] = await Promise.all([
      detail.installment?.groupId ? getInstallmentGroup(db, detail.installment.groupId) : [],
      getSplitParts(db, id),
      detail.parentTransactionId ? getParentTransaction(db, detail.parentTransactionId) : null,
    ]);
    return { detail, invoice, installments, splitParts, parentTransaction };
  });
}