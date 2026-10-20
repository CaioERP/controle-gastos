import crypto from 'node:crypto';
import { TZDate } from '@date-fns/tz';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { and, eq, gt, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { transactions, transactionSources } from '@/server/db/schema';
import { addMonthsISO, today as getToday, TZ } from '@/server/domain/dates';
import { assignInvoices, recalculateInvoices } from './invoices';
import { normalizeForMatch } from './normalize/text';
import type { PipelineContext } from './pipeline';
import { onePerTransaction } from './source-raw';
import { toDisplayCase } from './strings';

export type ParsedInstallment = {
  number: number;
  total: number;
  base: string;
};

/**
 * Reconhece parcelas em descrições de transações:
 * "LOJA PARC 03/10", "LOJA PARCELA 3/10", "LOJA 03/10", "LOJA 3 DE 10", "LOJA - Parcela 3/10".
 * Retorna null se não houver.
 *
 * Regras:
 * - number entre 1 e total;
 * - total entre 2 e 48;
 * - base: descrição sem o trecho da parcela, sem espaços/traços residuais.
 * - Datas ("05/10") ou anos ("10/2026") são descartados.
 */
export function parseInstallment(description: string): ParsedInstallment | null {
  if (!description) return null;

  const trimmed = description.trim();

  // 1. Prefixo explícito PARC ou PARCELA (em qualquer posição ou com separador)
  // Ex: "MAGAZINE LUIZA PARC 03/10", "LOJA - Parcela 3/10", "LOJA PARCELA 1 DE 12"
  const explicitRegex =
    /(?:[\s\-_/]+|^)(?:parc(?:ela)?\.?)\s*(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})(?:[\s\-_/]+|$)/i;
  const explicitMatch = trimmed.match(explicitRegex);

  if (explicitMatch && explicitMatch[1] && explicitMatch[2]) {
    const num = parseInt(explicitMatch[1], 10);
    const tot = parseInt(explicitMatch[2], 10);

    if (tot >= 2 && tot <= 48 && num >= 1 && num <= tot) {
      const base = cleanBase(trimmed.replace(explicitMatch[0], ' '));
      return { number: num, total: tot, base };
    }
  }

  // 2. Padrão no FINAL da descrição: "NN/NN" ou "N DE NN"
  // Ex: "Notebook Dell 3/10", "LOJA 3 DE 10", "LOJA 03/10"
  const endRegex = /(?:[\s\-_/]+)(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\s*$/i;
  const endMatch = trimmed.match(endRegex);

  if (endMatch && endMatch[1] && endMatch[2]) {
    const num = parseInt(endMatch[1], 10);
    const tot = parseInt(endMatch[2], 10);

    if (tot >= 2 && tot <= 48 && num >= 1 && num <= tot) {
      const base = cleanBase(trimmed.slice(0, endMatch.index));
      return { number: num, total: tot, base };
    }
  }

  return null;
}

function cleanBase(str: string): string {
  return str
    .replace(/[\s\-_/]+$/, '')
    .replace(/^[\s\-_/]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPurchaseDateFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as {
    purchaseDate?: unknown;
    creditCardMetadata?: { purchaseDate?: unknown } | null;
  };
  const val = obj.creditCardMetadata?.purchaseDate ?? obj.purchaseDate;
  if (typeof val !== 'string' || !val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return format(new TZDate(d, TZ), 'yyyy-MM-dd');
}

function hasPurchaseDate(raw: unknown): boolean {
  return extractPurchaseDateFromRaw(raw) !== null;
}

function computePurchaseDate(date: string, installmentNumber: number, raw: unknown): string {
  return extractPurchaseDateFromRaw(raw) ?? addMonthsISO(date, -(installmentNumber - 1));
}

function extractBaseDescription(description: string, descriptionRaw: string): string {
  const parsed = parseInstallment(description) ?? parseInstallment(descriptionRaw);
  return parsed ? parsed.base : description;
}

export async function linkInstallments(
  db: Db,
  transactionIds: string[],
  todayStr = getToday(),
): Promise<{
  linked: number;
  projectedCreated: number;
  projectedReplaced: number;
  createdProjectedIds: string[];
}> {
  if (transactionIds.length === 0) {
    return { linked: 0, projectedCreated: 0, projectedReplaced: 0, createdProjectedIds: [] };
  }

  const joinedRows = await db
    .select({
      tx: transactions,
      source: transactionSources.source,
      externalId: transactionSources.externalId,
      raw: transactionSources.raw,
    })
    .from(transactions)
    .leftJoin(transactionSources, eq(transactionSources.transactionId, transactions.id))
    .where(
      and(
        inArray(transactions.id, transactionIds),
        isNull(transactions.deletedAt),
        isNull(transactions.installmentGroupId),
        gt(transactions.installmentTotal, 1),
      ),
    );

  // Uma linha por transação (deduplicada tem várias fontes): prefere a que informa purchaseDate
  const rows = onePerTransaction(joinedRows, (r) => r.tx.id, hasPurchaseDate);

  if (rows.length === 0) {
    return { linked: 0, projectedCreated: 0, projectedReplaced: 0, createdProjectedIds: [] };
  }

  // Processa em ordem crescente do número da parcela
  rows.sort((a, b) => (a.tx.installmentNumber ?? 1) - (b.tx.installmentNumber ?? 1));

  let linked = 0;
  let projectedReplaced = 0;
  const createdProjectedIds: string[] = [];
  const affectedAccountIds = new Set<string>();

  for (const { tx, raw } of rows) {
    const installmentNumber = tx.installmentNumber ?? 1;
    const installmentTotal = tx.installmentTotal!;
    const baseDisplay = extractBaseDescription(tx.description, tx.descriptionRaw);
    const baseNorm = normalizeForMatch(baseDisplay);
    const txPurchaseDate = computePurchaseDate(tx.date, installmentNumber, raw);

    // Procura grupo existente na mesma conta
    const candidateRows = await db
      .select({
        tx: transactions,
        source: transactionSources.source,
        externalId: transactionSources.externalId,
        raw: transactionSources.raw,
      })
      .from(transactions)
      .leftJoin(transactionSources, eq(transactionSources.transactionId, transactions.id))
      .where(
        and(
          eq(transactions.accountId, tx.accountId),
          eq(transactions.installmentTotal, installmentTotal),
          isNotNull(transactions.installmentGroupId),
          isNull(transactions.deletedAt),
          ne(transactions.id, tx.id),
        ),
      );
    const candidates = onePerTransaction(candidateRows, (r) => r.tx.id, hasPurchaseDate);

    let groupId: string | null = null;
    for (const cand of candidates) {
      const candNum = cand.tx.installmentNumber ?? 1;
      const candBase = normalizeForMatch(
        extractBaseDescription(cand.tx.description, cand.tx.descriptionRaw),
      );
      if (candBase !== baseNorm) continue;
      if (Math.abs(Math.abs(cand.tx.amountCents) - Math.abs(tx.amountCents)) > 1) continue;

      const candPurchaseDate = computePurchaseDate(cand.tx.date, candNum, cand.raw);
      const diffDays = Math.abs(
        differenceInCalendarDays(parseISO(candPurchaseDate), parseISO(txPurchaseDate)),
      );
      if (diffDays <= 3) {
        groupId = cand.tx.installmentGroupId!;
        break;
      }
    }

    if (!groupId) {
      groupId = crypto.randomUUID();
    }

    let effectiveCategoryId = tx.categoryId;
    let effectiveCategorySource = tx.categorySource;
    let effectiveCategoryConfidence = tx.categoryConfidence;
    let effectiveUserEditedFields = tx.userEditedFields;

    // Substitui parcela projetada de mesmo installmentNumber se existir no grupo
    const [existingProjected] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.installmentGroupId, groupId),
          eq(transactions.installmentNumber, installmentNumber),
          eq(transactions.status, 'projected'),
        ),
      );

    if (existingProjected) {
      const projHasUserCategory =
        existingProjected.categoryId !== null &&
        (existingProjected.categorySource === 'user' ||
          existingProjected.userEditedFields.includes('category'));
      const realHasCategory =
        tx.categoryId !== null ||
        tx.categorySource === 'user' ||
        tx.userEditedFields.includes('category');

      if (projHasUserCategory && !realHasCategory) {
        effectiveCategoryId = existingProjected.categoryId;
        effectiveCategorySource = existingProjected.categorySource;
        effectiveCategoryConfidence = existingProjected.categoryConfidence;
        if (!effectiveUserEditedFields.includes('category')) {
          effectiveUserEditedFields = [...effectiveUserEditedFields, 'category'];
        }
      }

      await db.delete(transactions).where(eq(transactions.id, existingProjected.id));
      projectedReplaced++;
    }

    await db
      .update(transactions)
      .set({
        installmentGroupId: groupId,
        categoryId: effectiveCategoryId,
        categorySource: effectiveCategorySource,
        categoryConfidence: effectiveCategoryConfidence,
        userEditedFields: effectiveUserEditedFields,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, tx.id));
    linked++;
    affectedAccountIds.add(tx.accountId);

    // Verifica quais parcelas já existem no grupo
    const groupMembers = await db
      .select({ installmentNumber: transactions.installmentNumber })
      .from(transactions)
      .where(and(eq(transactions.installmentGroupId, groupId), isNull(transactions.deletedAt)));

    const existingNumbers = new Set(
      groupMembers.map((m) => m.installmentNumber).filter((n): n is number => n !== null),
    );

    // Cria as projetadas que faltam de installmentNumber + 1 até installmentTotal
    for (let k = installmentNumber + 1; k <= installmentTotal; k++) {
      if (existingNumbers.has(k)) continue;

      const projDate = addMonthsISO(tx.date, k - installmentNumber);
      const projDesc = `${toDisplayCase(baseDisplay)} ${k}/${installmentTotal}`;

      const [createdProj] = await db
        .insert(transactions)
        .values({
          accountId: tx.accountId,
          cardId: tx.cardId,
          date: projDate,
          amountCents: tx.amountCents,
          currency: tx.currency,
          descriptionRaw: projDesc,
          description: projDesc,
          merchantId: tx.merchantId,
          kind: tx.kind,
          paymentMethod: 'credit_card_installment',
          status: 'projected',
          categoryId: effectiveCategoryId,
          categorySource: effectiveCategorySource,
          categoryConfidence: effectiveCategoryConfidence,
          installmentGroupId: groupId,
          installmentNumber: k,
          installmentTotal,
        })
        .returning({ id: transactions.id });

      createdProjectedIds.push(createdProj!.id);
      existingNumbers.add(k);
    }
  }

  if (affectedAccountIds.size > 0) {
    await assignInvoices(db, [...affectedAccountIds], todayStr);
    await recalculateInvoices(db, [...affectedAccountIds], todayStr);
  }

  return {
    linked,
    projectedCreated: createdProjectedIds.length,
    projectedReplaced,
    createdProjectedIds,
  };
}

export async function runInstallmentsPipelineStep(ctx: PipelineContext): Promise<void> {
  const todayStr = ctx.today ?? getToday();
  const res = await linkInstallments(ctx.db, ctx.transactionIds, todayStr);
  if (res.projectedCreated > 0) {
    ctx.stats.projectedCreated = (ctx.stats.projectedCreated ?? 0) + res.projectedCreated;
    ctx.transactionIds.push(...res.createdProjectedIds);
  }
  if (res.projectedReplaced > 0) {
    ctx.stats.projectedReplaced = (ctx.stats.projectedReplaced ?? 0) + res.projectedReplaced;
  }
  await recalculateInvoices(ctx.db, ctx.accountIds, todayStr);
}
