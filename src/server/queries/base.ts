import { and, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  accounts,
  categories,
  invoices,
  transactions,
  transactionTags,
} from '@/server/db/schema';
import { REPORTABLE_KINDS } from '@/server/domain/enums';
import type { TxFilters } from '@/server/domain/filters';

export const parentCategories = alias(categories, 'parent_categories');

export function effectiveDate(basis?: TxFilters['basis']): SQL<string> {
  if (basis === 'cash') {
    return sql<string>`coalesce(case when ${accounts.type} = 'credit_card' then ${invoices.dueDate} end, ${transactions.date})`;
  }
  return sql<string>`${transactions.date}`;
}

export type WhereOptions = { forTotals: boolean; defaultKinds?: readonly string[] };

export function buildTxWhere(f: TxFilters, opts: WhereOptions): SQL {
  const d = effectiveDate(f.basis);
  const conds: (SQL | undefined)[] = [
    isNull(transactions.deletedAt),
    sql`${d} >= ${f.from}`,
    sql`${d} <= ${f.to}`,
    eq(accounts.isHidden, false),
    opts.forTotals && !f.accountIds?.length ? eq(accounts.includeInTotals, true) : undefined,
    f.includeProjected ? undefined : ne(transactions.status, 'projected'),
    inArray(transactions.kind, (f.kinds ?? opts.defaultKinds ?? REPORTABLE_KINDS) as never[]),
    f.institutionIds?.length ? inArray(accounts.institutionId, f.institutionIds) : undefined,
    f.accountIds?.length ? inArray(transactions.accountId, f.accountIds) : undefined,
    f.paymentMethods?.length ? inArray(transactions.paymentMethod, f.paymentMethods) : undefined,
    f.categoryIds?.length
      ? or(inArray(transactions.categoryId, f.categoryIds), inArray(categories.parentId, f.categoryIds))
      : undefined,
    f.tagIds?.length
      ? sql`exists (select 1 from ${transactionTags} tt where tt.transaction_id = ${transactions.id} and ${inArray(transactionTags.tagId, f.tagIds)})`
      : undefined,
    f.search ? sql`lower(${transactions.description}) like ${'%' + f.search.toLowerCase() + '%'}` : undefined,
    f.needsReview !== undefined ? eq(transactions.needsReview, f.needsReview) : undefined,
  ];
  return and(...conds.filter(Boolean))!;
}
