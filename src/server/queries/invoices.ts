import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
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
import type { InvoiceStatus } from '@/server/domain/enums';
import { parentCategories } from './base';
import type { TransactionRow } from './transactions';

export type InvoiceSummary = {
  id: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  status: InvoiceStatus;
  paidAt: string | null;
  paidAmountCents: number | null;
  itemCount: number;
  projectedCount: number;
};

export async function getInvoices(db: Db, accountId: string): Promise<InvoiceSummary[]> {
  const invRows = await db
    .select({
      id: invoices.id,
      referenceMonth: invoices.referenceMonth,
      closingDate: invoices.closingDate,
      dueDate: invoices.dueDate,
      totalCents: invoices.totalCents,
      status: invoices.status,
      paidAt: invoices.paidAt,
      paidAmountCents: invoices.paidAmountCents,
      itemCount: sql<number>`count(${transactions.id})`,
      projectedCount: sql<number>`count(case when ${transactions.status} = 'projected' then 1 end)`,
    })
    .from(invoices)
    .leftJoin(
      transactions,
      and(
        eq(transactions.invoiceId, invoices.id),
        ne(transactions.kind, 'invoice_payment'),
        isNull(transactions.deletedAt)
      )
    )
    .where(eq(invoices.accountId, accountId))
    .groupBy(invoices.id)
    .orderBy(desc(invoices.referenceMonth));

  return invRows.map((r) => ({
    id: r.id,
    referenceMonth: r.referenceMonth,
    closingDate: r.closingDate,
    dueDate: r.dueDate,
    totalCents: Number(r.totalCents ?? 0),
    status: r.status,
    paidAt: r.paidAt,
    paidAmountCents: r.paidAmountCents !== null ? Number(r.paidAmountCents) : null,
    itemCount: Number(r.itemCount ?? 0),
    projectedCount: Number(r.projectedCount ?? 0),
  }));
}

export async function getInvoiceItems(db: Db, invoiceId: string): Promise<TransactionRow[]> {
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
    .where(
      and(
        eq(transactions.invoiceId, invoiceId),
        ne(transactions.kind, 'invoice_payment'),
        isNull(transactions.deletedAt)
      )
    )
    .orderBy(transactions.date, transactions.id);

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
