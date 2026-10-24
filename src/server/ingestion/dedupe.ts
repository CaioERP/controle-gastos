import { and, between, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { PreviewCandidate } from '@/server/commands/imports';
import type { Db } from '@/server/db/client';
import { cards, transactions, transactionSources } from '@/server/db/schema';
import { addDaysISO } from '@/server/domain/dates';
import type { Source } from '@/server/domain/enums';
import { normalizeForMatch } from './normalize/text';
import { mergeIncoming, type MergePolicy } from './merge';
import { upsertCard } from './persist';
import type { NormalizedTransaction } from './types';

export type CrossSourceMatchResult = {
  status: 'new' | 'fuzzy_duplicate' | 'ambiguous_duplicate';
  matchedTransactionId: string | null;
  candidates: PreviewCandidate[];
};

/**
 * Limpa prefixos de adquirente ("IFD*", "PAG*", "MP*"), sufixos de parcela ("PARC 02/10", "2/10"),
 * datas/horários e pontuações, e aplica normalizeForMatch.
 */
export function normalizeDescriptionForDedupe(description: string): string {
  if (!description) return '';

  let s = normalizeForMatch(description);

  // Remove prefixos de gateway colados ou separados: ifd*, pag*, mp*, mercpago*, mercadopago*, picpay*, sumup*, ec*, pg*, paypal*, htm*, dl*
  s = s.replace(
    /^(?:ifd|pag|mp|mercpago|mercadopago|picpay|sumup|ec|pg|paypal|htm|dl)\s*[*.\-_\s]+\s*/i,
    '',
  );

  // Remove datas DD/MM(/YYYY) e horários HH:MM(:SS)
  s = s.replace(/\b\d{2}\/\d{2}(?:\/\d{2,4})?\b/g, ' ');
  s = s.replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, ' ');

  // Remove sufixos/trechos de parcela: "parc 02/10", "parcela 2 de 10", "1/1", "02/10"
  s = s.replace(/\bparc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|\s+de\s+)\s*\d{1,2}\b/g, ' ');
  s = s.replace(/(?:^|\s|-)\d{1,2}\/\d{1,2}(?:\s|$)/g, ' ');

  // Remove ruídos comuns de processadores/cartões
  s = s.replace(/\bhelp\.uber\.com\b/g, ' ');
  s = s.replace(/\*trip\b/g, ' ');
  s = s.replace(/\bdo\s+brasil\b/g, ' ');
  s = s.replace(/\b(?:ltda|s\/a|s\.a\.?|me|epp)\b/g, ' ');

  // Substitui pontuação restante por espaço e colapsa espaços
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  return s;
}

function getBigrams(str: string): string[] {
  const clean = str.replace(/\s+/g, ' ');
  if (clean.length < 2) return clean.length === 1 ? [clean] : [];
  const out: string[] = [];
  for (let i = 0; i < clean.length - 1; i++) {
    out.push(clean.slice(i, i + 2));
  }
  return out;
}

/**
 * Similaridade entre 0 e 1 usando Dice coefficient sobre bigramas de caracteres
 * (ou 0.85 se uma string normalizada contém a outra com pelo menos 4 caracteres, e 1.0 se idênticas).
 */
export function descriptionSimilarity(a: string, b: string): number {
  const normA = normalizeDescriptionForDedupe(a);
  const normB = normalizeDescriptionForDedupe(b);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const shorter = normA.length <= normB.length ? normA : normB;
  const longer = normA.length <= normB.length ? normB : normA;

  if (shorter.length >= 4 && longer.includes(shorter)) {
    return 0.85;
  }

  const bigramsA = getBigrams(normA);
  const bigramsB = getBigrams(normB);
  if (bigramsA.length === 0 || bigramsB.length === 0) return 0;

  const countsB = new Map<string, number>();
  for (const bg of bigramsB) {
    countsB.set(bg, (countsB.get(bg) ?? 0) + 1);
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    const c = countsB.get(bg) ?? 0;
    if (c > 0) {
      intersection++;
      countsB.set(bg, c - 1);
    }
  }

  return (2 * intersection) / (bigramsA.length + bigramsB.length);
}

export async function findCrossSourceMatches(
  db: Db,
  accountId: string,
  incoming: {
    date: string;
    amountCents: number;
    description: string;
    descriptionRaw: string;
    source: Source;
  },
  opts?: { excludeTransactionIds?: Set<string> },
): Promise<CrossSourceMatchResult> {
  const minDate = addDaysISO(incoming.date, -2);
  const maxDate = addDaysISO(incoming.date, 2);

  const potentialRows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.description,
      descriptionRaw: transactions.descriptionRaw,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        isNull(transactions.deletedAt),
        ne(transactions.status, 'projected'),
        isNull(transactions.parentTransactionId),
        eq(transactions.amountCents, incoming.amountCents),
        between(transactions.date, minDate, maxDate),
      ),
    );

  if (potentialRows.length === 0) {
    return { status: 'new', matchedTransactionId: null, candidates: [] };
  }

  const excluded = opts?.excludeTransactionIds;
  const filteredRows = excluded
    ? potentialRows.filter((r) => !excluded.has(r.id))
    : potentialRows;

  if (filteredRows.length === 0) {
    return { status: 'new', matchedTransactionId: null, candidates: [] };
  }

  const txIds = filteredRows.map((r) => r.id);
  const existingSources = await db
    .select({
      transactionId: transactionSources.transactionId,
      source: transactionSources.source,
    })
    .from(transactionSources)
    .where(inArray(transactionSources.transactionId, txIds));

  const txIdsWithSameSource = new Set<string>();
  for (const s of existingSources) {
    if (s.source === incoming.source) {
      txIdsWithSameSource.add(s.transactionId);
    }
  }

  const candidates: PreviewCandidate[] = [];
  for (const row of filteredRows) {
    if (txIdsWithSameSource.has(row.id)) continue;

    const simDesc = descriptionSimilarity(row.description, incoming.description);
    const simRaw = descriptionSimilarity(row.descriptionRaw, incoming.descriptionRaw);
    const similarity = Math.max(simDesc, simRaw);

    if (similarity >= 0.6) {
      candidates.push({
        transactionId: row.id,
        date: row.date,
        amountCents: row.amountCents,
        description: row.description,
        similarity,
      });
    }
  }

  if (candidates.length === 0) {
    return { status: 'new', matchedTransactionId: null, candidates: [] };
  }

  if (candidates.length === 1) {
    const only = candidates[0]!;
    return {
      status: 'fuzzy_duplicate',
      matchedTransactionId: only.transactionId,
      candidates,
    };
  }

  // 2+ candidatas: se houver uma única candidata com mesma data exata e similaridade >= 0.85
  // e as demais tiverem data diferente, escolha-a como fuzzy_duplicate
  const sameDateCands = candidates.filter((c) => c.date === incoming.date);
  const diffDateCands = candidates.filter((c) => c.date !== incoming.date);
  if (
    sameDateCands.length === 1 &&
    diffDateCands.length === candidates.length - 1 &&
    sameDateCands[0]!.similarity >= 0.85
  ) {
    return {
      status: 'fuzzy_duplicate',
      matchedTransactionId: sameDateCands[0]!.transactionId,
      candidates,
    };
  }

  return {
    status: 'ambiguous_duplicate',
    matchedTransactionId: null,
    candidates,
  };
}

export async function linkSourceToTransaction(
  db: Db,
  input: {
    transactionId: string;
    incoming: NormalizedTransaction;
    importBatchId?: string | null;
  },
): Promise<{ updated: boolean }> {
  const { transactionId, incoming, importBatchId } = input;

  const [existingSource] = await db
    .select({ id: transactionSources.id })
    .from(transactionSources)
    .where(
      and(
        eq(transactionSources.source, incoming.source),
        eq(transactionSources.externalId, incoming.externalId),
      ),
    );

  if (existingSource) {
    await db
      .update(transactionSources)
      .set({
        transactionId,
        raw: incoming.raw,
        fetchedAt: new Date(),
        ...(importBatchId !== undefined ? { importBatchId } : {}),
      })
      .where(eq(transactionSources.id, existingSource.id));
  } else {
    await db.insert(transactionSources).values({
      transactionId,
      source: incoming.source,
      externalId: incoming.externalId,
      raw: incoming.raw,
      fetchedAt: new Date(),
      importBatchId: importBatchId ?? null,
    });
  }

  const [existingTx] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId));

  if (!existingTx) {
    return { updated: false };
  }

  const currentSources = await db
    .select({ source: transactionSources.source })
    .from(transactionSources)
    .where(eq(transactionSources.transactionId, transactionId));

  const hadPluggy = currentSources.some((s) => s.source === 'pluggy' && incoming.source !== 'pluggy');
  const policy: MergePolicy = incoming.source === 'file' && hadPluggy ? 'fill-gaps' : 'replace';

  let cardId: string | null | undefined = undefined;
  if (incoming.cardLast4) {
    if (policy === 'fill-gaps' && !existingTx.cardId) {
      cardId = await upsertCard(db, existingTx.accountId, incoming.cardLast4);
    } else if (policy === 'replace') {
      cardId = await upsertCard(db, existingTx.accountId, incoming.cardLast4);
    }
  } else if (policy === 'replace') {
    cardId = existingTx.cardId;
  }

  const { patch, changed: updated } = mergeIncoming(
    existingTx,
    { ...incoming, cardId },
    policy,
  );

  if (updated) {
    await db.update(transactions).set(patch).where(eq(transactions.id, transactionId));
  }

  void cards;
  return { updated };
}
