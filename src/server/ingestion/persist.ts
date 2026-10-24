import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, cards, transactions, transactionSources } from '@/server/db/schema';
import { findCrossSourceMatches, linkSourceToTransaction } from './dedupe';
import { resolveInstitution } from './institutions';
import { mergeIncoming } from './merge';
import { findOrCreateMerchant } from './merchants';
import type { NormalizedTransaction, RawAccount } from './types';

/**
 * Upsert de conta por `(connection_id, external_id)`.
 * Atualiza `name`, `type`, `balanceCents`, `balanceUpdatedAt` e limites.
 * Atualiza `closingDay`/`dueDay` só se a fonte informar (não apaga o que o usuário configurou).
 * Nunca toca em `displayName`, `isHidden` ou `includeInTotals`.
 */
export async function upsertAccount(
  db: Db,
  connectionId: string,
  raw: RawAccount,
  institutionId?: string,
): Promise<string> {
  const resolvedInstitutionId = institutionId ?? (await resolveInstitution(db, raw.institutionName)).id;

  const [existing] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.connectionId, connectionId), eq(accounts.externalId, raw.externalId)));

  const now = new Date();

  if (!existing) {
    const [created] = await db
      .insert(accounts)
      .values({
        institutionId: resolvedInstitutionId,
        connectionId,
        externalId: raw.externalId,
        type: raw.type,
        name: raw.name,
        currency: raw.currency,
        balanceCents: raw.balanceCents,
        balanceUpdatedAt: now,
        creditLimitCents: raw.creditLimitCents ?? null,
        availableLimitCents: raw.availableLimitCents ?? null,
        closingDay: raw.closingDay ?? null,
        dueDay: raw.dueDay ?? null,
      })
      .returning({ id: accounts.id });

    return created!.id;
  }

  const updatePatch: Partial<typeof accounts.$inferInsert> = {
    institutionId: resolvedInstitutionId,
    name: raw.name,
    type: raw.type,
    currency: raw.currency,
    balanceCents: raw.balanceCents,
    balanceUpdatedAt: now,
    creditLimitCents: raw.creditLimitCents ?? null,
    availableLimitCents: raw.availableLimitCents ?? null,
    updatedAt: now,
  };

  if (raw.closingDay != null) {
    updatePatch.closingDay = raw.closingDay;
  }
  if (raw.dueDay != null) {
    updatePatch.dueDay = raw.dueDay;
  }

  await db.update(accounts).set(updatePatch).where(eq(accounts.id, existing.id));
  return existing.id;
}

/**
 * Upsert de cartão físico/virtual por `(account_id, last4)`.
 */
export async function upsertCard(db: Db, accountId: string, last4: string): Promise<string> {
  const [existing] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.accountId, accountId), eq(cards.last4, last4)));

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(cards)
    .values({ accountId, last4 })
    .onConflictDoNothing()
    .returning({ id: cards.id });

  if (created) {
    return created.id;
  }

  const [fallback] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.accountId, accountId), eq(cards.last4, last4)));

  return fallback!.id;
}

/**
 * A fonte mudou o valor de uma transação já dividida: a soma das partes deixa de bater. A divisão é
 * do usuário (R9), então fica como está; mãe e partes vão para a fila de revisão. A mãe sai das
 * listas e da fila (`notSplitParent`), por isso as partes também são marcadas.
 */
async function flagSplitMismatch(db: Db, parentId: string, newAmountCents: number): Promise<void> {
  const parts = await db
    .select({ id: transactions.id, amountCents: transactions.amountCents })
    .from(transactions)
    .where(and(eq(transactions.parentTransactionId, parentId), isNull(transactions.deletedAt)));
  if (parts.length === 0) return;
  const partsTotal = parts.reduce((sum, p) => sum + p.amountCents, 0);
  if (partsTotal === newAmountCents) return;
  await db
    .update(transactions)
    .set({ needsReview: true, updatedAt: new Date() })
    .where(inArray(transactions.id, [parentId, ...parts.map((p) => p.id)]));
}

/**
 * Upsert idempotente de transação por `(source, external_id)` (R10),
 * respeitando campos editados pelo usuário em `user_edited_fields` (R9).
 */
export async function upsertTransaction(
  db: Db,
  accountId: string,
  n: NormalizedTransaction,
  opts?: { importBatchId?: string },
): Promise<{ id: string; created: boolean; changed: boolean }> {
  const [existingSource] = await db
    .select({
      id: transactionSources.id,
      transactionId: transactionSources.transactionId,
    })
    .from(transactionSources)
    .where(and(eq(transactionSources.source, n.source), eq(transactionSources.externalId, n.externalId)));

  const merchantId = n.merchantName
    ? (await findOrCreateMerchant(db, n.merchantName, n.descriptionRaw)).id
    : null;
  const cardId = n.cardLast4 ? await upsertCard(db, accountId, n.cardLast4) : null;
  const installmentNumber = n.installment?.number ?? null;
  const installmentTotal = n.installment?.total ?? null;

  if (!existingSource) {
    if (n.source === 'pluggy') {
      const crossMatch = await findCrossSourceMatches(db, accountId, {
        source: n.source,
        date: n.date,
        amountCents: n.amountCents,
        description: n.description,
        descriptionRaw: n.descriptionRaw,
      });
      if (crossMatch.status === 'fuzzy_duplicate' && crossMatch.matchedTransactionId) {
        await linkSourceToTransaction(db, {
          transactionId: crossMatch.matchedTransactionId,
          incoming: n,
          importBatchId: opts?.importBatchId ?? null,
        });
        return { id: crossMatch.matchedTransactionId, created: false, changed: true };
      }
    }

    const [created] = await db
      .insert(transactions)
      .values({
        accountId,
        cardId,
        date: n.date,
        occurredAt: n.occurredAt ? new Date(n.occurredAt) : null,
        amountCents: n.amountCents,
        currency: n.currency,
        descriptionRaw: n.descriptionRaw,
        description: n.description,
        merchantId,
        providerCategoryId: n.providerCategoryId,
        kind: n.amountCents < 0 ? 'expense' : 'income',
        paymentMethod: n.paymentMethod,
        status: n.status,
        categoryId: null,
        categorySource: 'default',
        installmentNumber,
        installmentTotal,
      })
      .returning({ id: transactions.id });

    await db.insert(transactionSources).values({
      transactionId: created!.id,
      source: n.source,
      externalId: n.externalId,
      raw: n.raw,
      fetchedAt: new Date(),
      importBatchId: opts?.importBatchId ?? null,
    });

    return { id: created!.id, created: true, changed: false };
  }

  const [existingTx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, existingSource.transactionId));

  if (!existingTx) {
    throw new Error(`Transação ${existingSource.transactionId} referenciada por fonte não encontrada`);
  }

  const { patch, changed } = mergeIncoming(
    existingTx,
    { ...n, merchantId, cardId },
    'replace',
  );

  if (patch.amountCents !== undefined) {
    await flagSplitMismatch(db, existingTx.id, patch.amountCents);
  }

  if (changed) {
    await db.update(transactions).set(patch).where(eq(transactions.id, existingTx.id));
  }

  await db
    .update(transactionSources)
    .set({
      raw: n.raw,
      fetchedAt: new Date(),
      ...(opts?.importBatchId ? { importBatchId: opts.importBatchId } : {}),
    })
    .where(eq(transactionSources.id, existingSource.id));

  return { id: existingTx.id, created: false, changed };
}
