import { eq, inArray } from 'drizzle-orm';
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
  transactionTags,
} from '@/server/db/schema';
import type { AccountType, CategorySource, PaymentMethod, TxKind, TxStatus } from '@/server/domain/enums';
import { parentCategories } from './base';

export type TransactionTag = { id: string; name: string; color: string };

export type TransactionRow = {
  id: string;
  parentTransactionId?: string | null;
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
  tags: TransactionTag[];
};

/** Colunas comuns a todas as listagens de transação. */
const transactionRowColumns = {
  id: transactions.id,
  parentTransactionId: transactions.parentTransactionId,
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
};

/**
 * SELECT com os joins de todas as listagens. Inclui `invoices` porque o regime de caixa
 * (buildTxWhere com basis 'cash') usa o vencimento da fatura. Complete com .where/.orderBy/.limit.
 */
export function baseTransactionQuery(db: Db) {
  return db
    .select(transactionRowColumns)
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .innerJoin(institutions, eq(institutions.id, accounts.institutionId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .leftJoin(cards, eq(cards.id, transactions.cardId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(parentCategories, eq(parentCategories.id, categories.parentId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .$dynamic();
}

export type TransactionRowRecord = Awaited<ReturnType<typeof baseTransactionQuery>>[number];

/** Tags de várias transações numa consulta só (evita duplicar linhas no join principal). */
export async function loadTagsByTransaction(db: Db, ids: string[]): Promise<Map<string, TransactionTag[]>> {
  const byTransaction = new Map<string, TransactionTag[]>();
  if (ids.length === 0) return byTransaction;
  const rows = await db
    .select({ transactionId: transactionTags.transactionId, id: tags.id, name: tags.name, color: tags.color })
    .from(transactionTags)
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .where(inArray(transactionTags.transactionId, ids));
  for (const r of rows) {
    const list = byTransaction.get(r.transactionId) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    byTransaction.set(r.transactionId, list);
  }
  return byTransaction;
}

export function toTransactionRow(r: TransactionRowRecord, tagList: TransactionTag[] = []): TransactionRow {
  return {
    id: r.id,
    parentTransactionId: r.parentTransactionId ?? null,
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
    account: { id: r.accountId, name: r.accountDisplayName ?? r.accountName, type: r.accountType },
    institution: { id: r.institutionId, name: r.institutionName, color: r.institutionColor },
    card: r.cardLast4 ? { last4: r.cardLast4, isVirtual: r.cardIsVirtual ?? false } : null,
    installment:
      r.installmentNumber && r.installmentTotal
        ? { number: r.installmentNumber, total: r.installmentTotal, groupId: r.installmentGroupId }
        : null,
    tags: tagList,
  };
}

/** Converte linhas do baseTransactionQuery em TransactionRow, já com as tags. */
export async function toTransactionRows(db: Db, rows: TransactionRowRecord[]): Promise<TransactionRow[]> {
  const tagMap = await loadTagsByTransaction(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toTransactionRow(r, tagMap.get(r.id)));
}
