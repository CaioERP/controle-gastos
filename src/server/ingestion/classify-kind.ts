import crypto from 'node:crypto';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, invoices, transactions } from '@/server/db/schema';
import { addDaysISO, today as getToday } from '@/server/domain/dates';
import type { AccountType, PaymentMethod, TxKind } from '@/server/domain/enums';
import { recalculateInvoices } from './invoices';
import { normalizeForMatch } from './normalize/text';
import type { PipelineContext } from './pipeline';

const INVOICE_PAYMENT_BANK_REGEX =
  /\b(?:(?:pagamento|pagto|pgto|pag)\s+(?:de\s+)?(?:fatura|cartao)|fatura\s+(?:do\s+)?cartao|nubank\s+fatura|pagamento\s+cartao\s+de\s+credito)\b/;

const INVOICE_PAYMENT_CARD_REGEX =
  /\b(?:pagamento\s+(?:recebido|efetuado)|pagto\s+recebido|pagamento\s+de\s+fatura|credito\s+de\s+pagamento)\b/;

const INVESTMENT_REGEX =
  /\b(?:aplicacao|aplic|resgate|cdb|lci|lca|tesouro|invest(?:imento|imentos)?|cofrinho|caixinha|porquinho|poupanca)\b/;

const REFUND_BANK_REGEX = /\b(?:estorno|devolucao|reembolso|cancelamento)\b/;

const TRANSFER_METHODS = new Set<PaymentMethod>(['pix', 'ted_doc', 'other']);

export type UnpaidInvoiceCandidate = {
  id: string;
  accountId: string;
  dueDate: string;
  totalCents: number;
  paidAt: string | null;
  status: string;
};

export function daysBetweenAbs(d1: string, d2: string): number {
  return Math.abs(differenceInCalendarDays(parseISO(d1), parseISO(d2)));
}

export function matchUnpaidInvoiceForPayment(
  tx: { date: string; amountCents: number },
  unpaidInvoices: UnpaidInvoiceCandidate[],
): UnpaidInvoiceCandidate | null {
  if (tx.amountCents >= 0) return null;
  const absAmount = Math.abs(tx.amountCents);

  const matches = unpaidInvoices.filter((inv) => {
    if (inv.paidAt !== null || inv.status === 'paid' || inv.totalCents <= 0) return false;
    const diffDays = daysBetweenAbs(inv.dueDate, tx.date);
    if (diffDays > 5) return false;
    const diffAmount = Math.abs(inv.totalCents - absAmount);
    return diffAmount <= inv.totalCents * 0.01;
  });

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const diffDateA = daysBetweenAbs(a.dueDate, tx.date);
    const diffDateB = daysBetweenAbs(b.dueDate, tx.date);
    if (diffDateA !== diffDateB) return diffDateA - diffDateB;
    return Math.abs(a.totalCents - absAmount) - Math.abs(b.totalCents - absAmount);
  });

  return matches[0]!;
}

export function classifySingleKind(input: {
  accountType: AccountType;
  amountCents: number;
  description: string;
  matchedInvoice: boolean;
}): TxKind {
  const norm = normalizeForMatch(input.description);

  // 1. Pagamento de fatura, lado da conta corrente
  if (
    input.accountType !== 'credit_card' &&
    input.amountCents < 0 &&
    (INVOICE_PAYMENT_BANK_REGEX.test(norm) || input.matchedInvoice)
  ) {
    return 'invoice_payment';
  }

  // 2. Pagamento de fatura, lado do cartão
  if (
    input.accountType === 'credit_card' &&
    input.amountCents > 0 &&
    INVOICE_PAYMENT_CARD_REGEX.test(norm)
  ) {
    return 'invoice_payment';
  }

  // 3. Investimento
  if (INVESTMENT_REGEX.test(norm)) {
    return 'investment';
  }

  // 5. Estorno
  if (input.accountType === 'credit_card' && input.amountCents > 0) {
    return 'refund';
  }
  if (
    input.accountType !== 'credit_card' &&
    input.amountCents > 0 &&
    REFUND_BANK_REGEX.test(norm)
  ) {
    return 'refund';
  }

  // 6. Padrão
  return input.amountCents < 0 ? 'expense' : 'income';
}

export type TransferCandidate = {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  transferGroupId: string | null;
};

export type TransferPairsResult = {
  pairs: Array<{ debitId: string; creditId: string }>;
  ambiguousIds: string[];
};

/**
 * Pareia transferências internas entre contas próprias (R7):
 * - Mesma quantia absoluta, sinais opostos, contas diferentes, distância de até 3 dias.
 * - Escolhe a candidata de data mais próxima; em caso de empate, não pareia e marca como ambíguas (`needsReview`).
 */
export function findTransferPairs(candidates: TransferCandidate[]): TransferPairsResult {
  const eligible = candidates.filter(
    (c) =>
      c.transferGroupId === null &&
      c.amountCents !== 0 &&
      TRANSFER_METHODS.has(c.paymentMethod),
  );

  const debits = eligible.filter((c) => c.amountCents < 0);
  const credits = eligible.filter((c) => c.amountCents > 0);

  const usedDebits = new Set<string>();
  const usedCredits = new Set<string>();
  const ambiguous = new Set<string>();
  const pairs: Array<{ debitId: string; creditId: string }> = [];

  for (const debit of debits) {
    if (usedDebits.has(debit.id) || ambiguous.has(debit.id)) continue;

    const absVal = Math.abs(debit.amountCents);
    const possibleCredits = credits
      .filter(
        (cr) =>
          !usedCredits.has(cr.id) &&
          !ambiguous.has(cr.id) &&
          cr.accountId !== debit.accountId &&
          cr.amountCents === absVal &&
          daysBetweenAbs(debit.date, cr.date) <= 3,
      )
      .map((cr) => ({ cr, dist: daysBetweenAbs(debit.date, cr.date) }))
      .sort((a, b) => a.dist - b.dist);

    if (possibleCredits.length === 0) continue;

    const minDist = possibleCredits[0]!.dist;
    const tiedCredits = possibleCredits.filter((p) => p.dist === minDist);

    if (tiedCredits.length > 1) {
      ambiguous.add(debit.id);
      for (const t of tiedCredits) ambiguous.add(t.cr.id);
      continue;
    }

    const bestCredit = tiedCredits[0]!.cr;

    // Verifica pelo lado do crédito se há empate de débitos à mesma distância mínima
    const possibleDebitsForCredit = debits
      .filter(
        (d) =>
          !usedDebits.has(d.id) &&
          !ambiguous.has(d.id) &&
          d.accountId !== bestCredit.accountId &&
          Math.abs(d.amountCents) === bestCredit.amountCents &&
          daysBetweenAbs(d.date, bestCredit.date) <= 3,
      )
      .map((d) => ({ d, dist: daysBetweenAbs(d.date, bestCredit.date) }))
      .sort((a, b) => a.dist - b.dist);

    const minDebitDist = possibleDebitsForCredit[0]!.dist;
    const tiedDebits = possibleDebitsForCredit.filter((p) => p.dist === minDebitDist);

    if (tiedDebits.length > 1) {
      ambiguous.add(bestCredit.id);
      for (const t of tiedDebits) ambiguous.add(t.d.id);
      continue;
    }

    if (tiedDebits[0]!.d.id === debit.id) {
      usedDebits.add(debit.id);
      usedCredits.add(bestCredit.id);
      pairs.push({ debitId: debit.id, creditId: bestCredit.id });
    }
  }

  return {
    pairs,
    ambiguousIds: [...ambiguous],
  };
}

const NON_CATEGORIZABLE_KINDS = new Set<TxKind>(['transfer', 'invoice_payment', 'investment']);

export async function classifyKinds(
  db: Db,
  transactionIds: string[],
  todayStr = getToday(),
): Promise<{
  updated: number;
  transferPairs: number;
  invoicesPaid: number;
}> {
  if (transactionIds.length === 0) {
    return { updated: 0, transferPairs: 0, invoicesPaid: 0 };
  }

  const contextRows = await db
    .select({
      tx: transactions,
      accountType: accounts.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(inArray(transactions.id, transactionIds), isNull(transactions.deletedAt)));

  if (contextRows.length === 0) {
    return { updated: 0, transferPairs: 0, invoicesPaid: 0 };
  }

  const unpaidInvoices = await db
    .select({
      id: invoices.id,
      accountId: invoices.accountId,
      dueDate: invoices.dueDate,
      totalCents: invoices.totalCents,
      paidAt: invoices.paidAt,
      status: invoices.status,
    })
    .from(invoices)
    .where(isNull(invoices.paidAt));

  let updated = 0;
  let invoicesPaid = 0;
  const affectedCardAccountIds = new Set<string>();
  const resolvedSpecialIds = new Set<string>();

  // Passos 1, 2, 3, 5 e 6 para transações do contexto sem kind editado pelo usuário e sem transferGroupId
  for (const { tx, accountType } of contextRows) {
    if (tx.userEditedFields.includes('kind')) {
      resolvedSpecialIds.add(tx.id);
      continue;
    }

    if (tx.transferGroupId !== null) {
      resolvedSpecialIds.add(tx.id);
      continue;
    }

    const matchedInv =
      accountType !== 'credit_card' && tx.amountCents < 0
        ? matchUnpaidInvoiceForPayment(tx, unpaidInvoices)
        : null;

    // Já classificada como pagamento de fatura numa sincronização anterior: a fatura que ela quitou
    // está paga e não casa mais, então sem isto a reclassificação (ex.: pendente → lançado) a
    // devolveria para `expense` e o valor contaria em dobro com as compras do cartão (R2).
    const keptInvoicePayment =
      accountType !== 'credit_card' && tx.amountCents < 0 && tx.kind === 'invoice_payment';

    const nextKind = classifySingleKind({
      accountType,
      amountCents: tx.amountCents,
      description: tx.descriptionRaw || tx.description,
      matchedInvoice: matchedInv !== null || keptInvoicePayment,
    });

    if (
      nextKind === 'invoice_payment' ||
      nextKind === 'investment' ||
      (accountType === 'credit_card' && nextKind === 'refund')
    ) {
      resolvedSpecialIds.add(tx.id);
    }

    if (nextKind === 'invoice_payment' && matchedInv) {
      matchedInv.paidAt = tx.date;
      matchedInv.status = 'paid';
      await db
        .update(invoices)
        .set({
          paidAt: tx.date,
          paidAmountCents: Math.abs(tx.amountCents),
          status: 'paid',
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, matchedInv.id));
      invoicesPaid++;
    }

    if (nextKind === 'invoice_payment' && accountType === 'credit_card') {
      affectedCardAccountIds.add(tx.accountId);
    }

    const patch: Partial<typeof transactions.$inferInsert> = {};
    let changed = false;

    if (tx.kind !== nextKind) {
      patch.kind = nextKind;
      changed = true;
    }

    if (NON_CATEGORIZABLE_KINDS.has(nextKind) && !tx.userEditedFields.includes('category')) {
      if (tx.categoryId !== null) {
        patch.categoryId = null;
        changed = true;
      }
      if (tx.categorySource !== 'default') {
        patch.categorySource = 'default';
        changed = true;
      }
      if (tx.needsReview !== false) {
        patch.needsReview = false;
        changed = true;
      }
    }

    if (changed) {
      patch.updatedAt = new Date();
      await db.update(transactions).set(patch).where(eq(transactions.id, tx.id));
      updated++;
    }
  }

  // Passo 4: Transferências internas numa janela de ±3 dias das transações não-cartão do contexto
  const nonCardContextDates = contextRows
    .filter(
      (r) =>
        r.accountType !== 'credit_card' &&
        !resolvedSpecialIds.has(r.tx.id) &&
        TRANSFER_METHODS.has(r.tx.paymentMethod),
    )
    .map((r) => r.tx.date)
    .sort();

  let transferPairs = 0;
  if (nonCardContextDates.length > 0) {
    const minDate = addDaysISO(nonCardContextDates[0]!, -3);
    const maxDate = addDaysISO(nonCardContextDates[nonCardContextDates.length - 1]!, 3);

    const windowRows = await db
      .select({
        tx: transactions,
        accountType: accounts.type,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          gte(transactions.date, minDate),
          lte(transactions.date, maxDate),
          isNull(transactions.deletedAt),
        ),
      );

    const candidates: TransferCandidate[] = [];
    const byId = new Map<string, typeof transactions.$inferSelect>();

    for (const { tx, accountType } of windowRows) {
      if (accountType === 'credit_card') continue;
      if (tx.userEditedFields.includes('kind')) continue;
      if (tx.transferGroupId !== null) continue;
      if (tx.kind === 'invoice_payment' || tx.kind === 'investment') continue;
      if (!TRANSFER_METHODS.has(tx.paymentMethod)) continue;

      byId.set(tx.id, tx);
      candidates.push({
        id: tx.id,
        accountId: tx.accountId,
        date: tx.date,
        amountCents: tx.amountCents,
        paymentMethod: tx.paymentMethod,
        transferGroupId: tx.transferGroupId,
      });
    }

    const { pairs, ambiguousIds } = findTransferPairs(candidates);

    for (const pair of pairs) {
      const groupId = crypto.randomUUID();
      for (const txId of [pair.debitId, pair.creditId]) {
        const tx = byId.get(txId)!;
        const keepCategory = tx.userEditedFields.includes('category');
        await db
          .update(transactions)
          .set({
            kind: 'transfer',
            transferGroupId: groupId,
            categoryId: keepCategory ? tx.categoryId : null,
            categorySource: keepCategory ? tx.categorySource : 'default',
            needsReview: keepCategory ? tx.needsReview : false,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, txId));
        updated++;
      }
      transferPairs++;
    }

    if (ambiguousIds.length > 0) {
      await db
        .update(transactions)
        .set({ needsReview: true, updatedAt: new Date() })
        .where(inArray(transactions.id, ambiguousIds));
    }
  }

  if (affectedCardAccountIds.size > 0) {
    await recalculateInvoices(db, [...affectedCardAccountIds], todayStr);
  }

  return { updated, transferPairs, invoicesPaid };
}

export async function runClassifyKindPipelineStep(ctx: PipelineContext): Promise<void> {
  const todayStr = ctx.today ?? getToday();
  const res = await classifyKinds(ctx.db, ctx.transactionIds, todayStr);
  if (res.transferPairs > 0) {
    ctx.stats.transferPairs = (ctx.stats.transferPairs ?? 0) + res.transferPairs;
  }
  if (res.invoicesPaid > 0) {
    ctx.stats.invoicesPaid = (ctx.stats.invoicesPaid ?? 0) + res.invoicesPaid;
  }
}
