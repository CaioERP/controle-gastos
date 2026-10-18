import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  cards,
  categories,
  institutions,
  invoices,
  merchants,
  tags,
  transactions,
  transactionSources,
  transactionTags,
} from '@/server/db/schema';
import { TX_KINDS, type AccountType, type CategorySource, type PaymentMethod, type Source, type TxKind, type TxStatus } from '@/server/domain/enums';
import type { TxFilters } from '@/server/domain/filters';
import { buildTxWhere, parentCategories } from './base';

export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  descriptionRaw: string;
  amountCents: number;
  kind: TxKind;
  paymentMethod: PaymentMethod;
  status: TxStatus;
  notes: string | null;
  needsReview: boolean;
  categorySource: CategorySource;
  categoryConfidence: number | null;
  category: { id: string; name: string; color: string; icon: string; parentName: string | null } | null;
  merchant: { id: string; name: string } | null;
  account: { id: string; name: string; type: AccountType };
  institution: { id: string; name: string; color: string };
  card: { last4: string; isVirtual: boolean } | null;
  installment: { number: number; total: number; groupId: string | null } | null;
  tags: Array<{ id: string; name: string; color: string }>;
};

export type ListTransactionsPage = {
  cursor?: string;
  limit?: number;
};

export type ListTransactionsResult = {
  items: TransactionRow[];
  nextCursor: string | null;
};

export function encodeCursor(date: string, id: string): string {
  return Buffer.from(`${date}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const [date, id] = raw.split('|');
    if (!date || !id) return null;
    return { date, id };
  } catch {
    return null;
  }
}

export async function listTransactions(
  db: Db,
  f: TxFilters,
  page: ListTransactionsPage = {}
): Promise<ListTransactionsResult> {
  const limit = Math.min(Math.max(1, page.limit ?? 50), 200);
  const where = buildTxWhere(f, { forTotals: false, defaultKinds: TX_KINDS });

  let cursorCond = undefined;
  if (page.cursor) {
    const decoded = decodeCursor(page.cursor);
    if (decoded) {
      cursorCond = or(
        sql`${transactions.date} < ${decoded.date}`,
        and(eq(transactions.date, decoded.date), sql`${transactions.id} < ${decoded.id}`)
      );
    }
  }

  const queryWhere = cursorCond ? and(where, cursorCond) : where;

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      descriptionRaw: transactions.descriptionRaw,
      amountCents: transactions.amountCents,
      kind: transactions.kind,
      paymentMethod: transactions.paymentMethod,
      status: transactions.status,
      notes: transactions.notes,
      needsReview: transactions.needsReview,
      categorySource: transactions.categorySource,
      categoryConfidence: transactions.categoryConfidence,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      parentCategoryName: parentCategories.name,
      merchantId: merchants.id,
      merchantName: merchants.name,
      accountId: accounts.id,
      accountName: accounts.name,
      accountDisplayName: accounts.displayName,
      accountType: accounts.type,
      institutionId: institutions.id,
      institutionName: institutions.name,
      institutionColor: institutions.color,
      cardLast4: cards.last4,
      cardIsVirtual: cards.isVirtual,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      installmentGroupId: transactions.installmentGroupId,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .innerJoin(institutions, eq(institutions.id, accounts.institutionId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .leftJoin(cards, eq(cards.id, transactions.cardId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(parentCategories, eq(parentCategories.id, categories.parentId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(queryWhere)
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

  // Busca tags em lote para os ids da página
  const txIds = pageRows.map((r) => r.id);
  const tagMap = new Map<string, Array<{ id: string; name: string; color: string }>>();

  if (txIds.length > 0) {
    const tagRows = await db
      .select({
        transactionId: transactionTags.transactionId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(transactionTags)
      .innerJoin(tags, eq(tags.id, transactionTags.tagId))
      .where(inArray(transactionTags.transactionId, txIds));

    for (const tr of tagRows) {
      if (!tagMap.has(tr.transactionId)) tagMap.set(tr.transactionId, []);
      tagMap.get(tr.transactionId)!.push({ id: tr.id, name: tr.name, color: tr.color });
    }
  }

  const items: TransactionRow[] = pageRows.map((r) => ({
    id: r.id,
    date: r.date,
    description: r.description,
    descriptionRaw: r.descriptionRaw,
    amountCents: r.amountCents,
    kind: r.kind,
    paymentMethod: r.paymentMethod,
    status: r.status,
    notes: r.notes,
    needsReview: r.needsReview,
    categorySource: r.categorySource,
    categoryConfidence: r.categoryConfidence,
    category: r.categoryId
      ? {
          id: r.categoryId,
          name: r.categoryName!,
          color: r.categoryColor!,
          icon: r.categoryIcon!,
          parentName: r.parentCategoryName ?? null,
        }
      : null,
    merchant: r.merchantId ? { id: r.merchantId, name: r.merchantName! } : null,
    account: {
      id: r.accountId,
      name: r.accountDisplayName ?? r.accountName,
      type: r.accountType,
    },
    institution: {
      id: r.institutionId,
      name: r.institutionName,
      color: r.institutionColor,
    },
    card: r.cardLast4 ? { last4: r.cardLast4, isVirtual: r.cardIsVirtual ?? false } : null,
    installment:
      r.installmentNumber && r.installmentTotal
        ? {
            number: r.installmentNumber,
            total: r.installmentTotal,
            groupId: r.installmentGroupId,
          }
        : null,
    tags: tagMap.get(r.id) ?? [],
  }));

  let nextCursor: string | null = null;
  if (hasNextPage && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1]!;
    nextCursor = encodeCursor(last.date, last.id);
  }

  return { items, nextCursor };
}

export type TransactionDetail = TransactionRow & {
  sources: Array<{ source: Source; externalId: string; fetchedAt: Date; raw: unknown }>;
};

export async function getTransaction(db: Db, id: string): Promise<TransactionDetail | null> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      descriptionRaw: transactions.descriptionRaw,
      amountCents: transactions.amountCents,
      kind: transactions.kind,
      paymentMethod: transactions.paymentMethod,
      status: transactions.status,
      notes: transactions.notes,
      needsReview: transactions.needsReview,
      categorySource: transactions.categorySource,
      categoryConfidence: transactions.categoryConfidence,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      parentCategoryName: parentCategories.name,
      merchantId: merchants.id,
      merchantName: merchants.name,
      accountId: accounts.id,
      accountName: accounts.name,
      accountDisplayName: accounts.displayName,
      accountType: accounts.type,
      institutionId: institutions.id,
      institutionName: institutions.name,
      institutionColor: institutions.color,
      cardLast4: cards.last4,
      cardIsVirtual: cards.isVirtual,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      installmentGroupId: transactions.installmentGroupId,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .innerJoin(institutions, eq(institutions.id, accounts.institutionId))
    .leftJoin(cards, eq(cards.id, transactions.cardId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(parentCategories, eq(parentCategories.id, categories.parentId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)));

  const r = rows[0];
  if (!r) return null;

  const [tagRows, sourceRows] = await Promise.all([
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(transactionTags)
      .innerJoin(tags, eq(tags.id, transactionTags.tagId))
      .where(eq(transactionTags.transactionId, id)),
    db
      .select({
        source: transactionSources.source,
        externalId: transactionSources.externalId,
        fetchedAt: transactionSources.fetchedAt,
        raw: transactionSources.raw,
      })
      .from(transactionSources)
      .where(eq(transactionSources.transactionId, id)),
  ]);

  return {
    id: r.id,
    date: r.date,
    description: r.description,
    descriptionRaw: r.descriptionRaw,
    amountCents: r.amountCents,
    kind: r.kind,
    paymentMethod: r.paymentMethod,
    status: r.status,
    notes: r.notes,
    needsReview: r.needsReview,
    categorySource: r.categorySource,
    categoryConfidence: r.categoryConfidence,
    category: r.categoryId
      ? {
          id: r.categoryId,
          name: r.categoryName!,
          color: r.categoryColor!,
          icon: r.categoryIcon!,
          parentName: r.parentCategoryName ?? null,
        }
      : null,
    merchant: r.merchantId ? { id: r.merchantId, name: r.merchantName! } : null,
    account: {
      id: r.accountId,
      name: r.accountDisplayName ?? r.accountName,
      type: r.accountType,
    },
    institution: {
      id: r.institutionId,
      name: r.institutionName,
      color: r.institutionColor,
    },
    card: r.cardLast4 ? { last4: r.cardLast4, isVirtual: r.cardIsVirtual ?? false } : null,
    installment:
      r.installmentNumber && r.installmentTotal
        ? {
            number: r.installmentNumber,
            total: r.installmentTotal,
            groupId: r.installmentGroupId,
          }
        : null,
    tags: tagRows,
    sources: sourceRows,
  };
}

export async function getInstallmentGroup(db: Db, groupId: string): Promise<TransactionRow[]> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      descriptionRaw: transactions.descriptionRaw,
      amountCents: transactions.amountCents,
      kind: transactions.kind,
      paymentMethod: transactions.paymentMethod,
      status: transactions.status,
      notes: transactions.notes,
      needsReview: transactions.needsReview,
      categorySource: transactions.categorySource,
      categoryConfidence: transactions.categoryConfidence,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      parentCategoryName: parentCategories.name,
      merchantId: merchants.id,
      merchantName: merchants.name,
      accountId: accounts.id,
      accountName: accounts.name,
      accountDisplayName: accounts.displayName,
      accountType: accounts.type,
      institutionId: institutions.id,
      institutionName: institutions.name,
      institutionColor: institutions.color,
      cardLast4: cards.last4,
      cardIsVirtual: cards.isVirtual,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      installmentGroupId: transactions.installmentGroupId,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .innerJoin(institutions, eq(institutions.id, accounts.institutionId))
    .leftJoin(cards, eq(cards.id, transactions.cardId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(parentCategories, eq(parentCategories.id, categories.parentId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(and(eq(transactions.installmentGroupId, groupId), isNull(transactions.deletedAt)))
    .orderBy(transactions.installmentNumber, transactions.date);

  const txIds = rows.map((r) => r.id);
  const tagMap = new Map<string, Array<{ id: string; name: string; color: string }>>();

  if (txIds.length > 0) {
    const tagRows = await db
      .select({
        transactionId: transactionTags.transactionId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(transactionTags)
      .innerJoin(tags, eq(tags.id, transactionTags.tagId))
      .where(inArray(transactionTags.transactionId, txIds));

    for (const tr of tagRows) {
      if (!tagMap.has(tr.transactionId)) tagMap.set(tr.transactionId, []);
      tagMap.get(tr.transactionId)!.push({ id: tr.id, name: tr.name, color: tr.color });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    description: r.description,
    descriptionRaw: r.descriptionRaw,
    amountCents: r.amountCents,
    kind: r.kind,
    paymentMethod: r.paymentMethod,
    status: r.status,
    notes: r.notes,
    needsReview: r.needsReview,
    categorySource: r.categorySource,
    categoryConfidence: r.categoryConfidence,
    category: r.categoryId
      ? {
          id: r.categoryId,
          name: r.categoryName!,
          color: r.categoryColor!,
          icon: r.categoryIcon!,
          parentName: r.parentCategoryName ?? null,
        }
      : null,
    merchant: r.merchantId ? { id: r.merchantId, name: r.merchantName! } : null,
    account: {
      id: r.accountId,
      name: r.accountDisplayName ?? r.accountName,
      type: r.accountType,
    },
    institution: {
      id: r.institutionId,
      name: r.institutionName,
      color: r.institutionColor,
    },
    card: r.cardLast4 ? { last4: r.cardLast4, isVirtual: r.cardIsVirtual ?? false } : null,
    installment:
      r.installmentNumber && r.installmentTotal
        ? {
            number: r.installmentNumber,
            total: r.installmentTotal,
            groupId: r.installmentGroupId,
          }
        : null,
    tags: tagMap.get(r.id) ?? [],
  }));
}

export async function getReviewCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.needsReview, true), isNull(transactions.deletedAt)));
  return Number(row?.count ?? 0);
}
