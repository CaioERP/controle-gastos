'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import {
  deleteInvestmentTransaction,
  deleteManualHolding,
  recordInvestmentTransaction,
  refreshMarketPrices,
  upsertManualHolding,
  type RecordInvestmentTransactionInput,
  type UpsertManualHoldingInput,
} from '@/server/commands';
import { runAction } from '@/lib/action';

export async function refreshMarketPricesAction() {
  const result = await runAction(() => refreshMarketPrices(getDb()));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function upsertManualHoldingAction(input: UpsertManualHoldingInput) {
  const result = await runAction(() => upsertManualHolding(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function deleteManualHoldingAction(input: { holdingId: string }) {
  const result = await runAction(() => deleteManualHolding(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function recordInvestmentTransactionAction(input: RecordInvestmentTransactionInput) {
  const result = await runAction(() => recordInvestmentTransaction(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function deleteInvestmentTransactionAction(input: { investmentTransactionId: string }) {
  const result = await runAction(() => deleteInvestmentTransaction(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

