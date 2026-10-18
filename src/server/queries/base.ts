import { and, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  accounts,
  categories,
  institutions,
  invoices,
  merchants,
  tags,
  transactions,
  transactionTags,
} from '@/server/db/schema';
import { REPORTABLE_KINDS } from '@/server/domain/enums';
import type { Dimension, TxFilters } from '@/server/domain/filters';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';

export const parentCategories = alias(categories, 'parent_categories');

/**
 * Data efetiva conforme o regime (R5):
 * competência = data da transação; caixa = vencimento da fatura para cartão, data da transação para o resto.
 * Exige LEFT JOIN em accounts e invoices.
 */
export function effectiveDate(basis?: TxFilters['basis']): SQL<string> {
  if (basis === 'cash') {
    return sql<string>`coalesce(case when ${accounts.type} = 'credit_card' then ${invoices.dueDate} end, ${transactions.date})`;
  }
  return sql<string>`${transactions.date}`;
}

/** Valor de gasto positivo: despesa conta positivo, estorno abate. */
export const spendValue = sql<number>`case when ${transactions.kind} in ('expense','refund') then -${transactions.amountCents} else 0 end`;
export const incomeValue = sql<number>`case when ${transactions.kind} = 'income' then ${transactions.amountCents} else 0 end`;

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

export type DimensionSql = {
  key: SQL<string>;
  label: SQL<string>;
  color: SQL<string | null>;
  groupBy: SQL[];
  mapLabel?: (key: string, label: string) => string;
};

export function dimensionSql(by: Dimension): DimensionSql {
  switch (by) {
    case 'category': {
      const key = sql<string>`coalesce(${categories.id}::text, 'uncategorized')`;
      const label = sql<string>`coalesce(${categories.name}, 'Sem categoria')`;
      const color = sql<string | null>`coalesce(${categories.color}, '#9CA3AF')`;
      return {
        key,
        label,
        color,
        groupBy: [key, label, color],
      };
    }
    case 'parentCategory': {
      const key = sql<string>`coalesce(${parentCategories.id}::text, ${categories.id}::text, 'uncategorized')`;
      const label = sql<string>`coalesce(${parentCategories.name}, ${categories.name}, 'Sem categoria')`;
      const color = sql<string | null>`coalesce(${parentCategories.color}, ${categories.color}, '#9CA3AF')`;
      return {
        key,
        label,
        color,
        groupBy: [key, label, color],
      };
    }
    case 'paymentMethod': {
      const key = sql<string>`${transactions.paymentMethod}::text`;
      return {
        key,
        label: key,
        color: sql<null>`null`,
        groupBy: [sql`${transactions.paymentMethod}`],
        mapLabel: (k) => PAYMENT_METHOD_LABELS[k as keyof typeof PAYMENT_METHOD_LABELS] ?? k,
      };
    }
    case 'institution': {
      const key = sql<string>`${institutions.id}::text`;
      const label = sql<string>`${institutions.name}`;
      const color = sql<string | null>`${institutions.color}`;
      return {
        key,
        label,
        color,
        groupBy: [sql`${institutions.id}`, sql`${institutions.name}`, sql`${institutions.color}`],
      };
    }
    case 'account': {
      const key = sql<string>`${accounts.id}::text`;
      const label = sql<string>`coalesce(${accounts.displayName}, ${accounts.name})`;
      const color = sql<string | null>`${institutions.color}`;
      return {
        key,
        label,
        color,
        groupBy: [sql`${accounts.id}`, label, sql`${institutions.color}`],
      };
    }
    case 'merchant': {
      const key = sql<string>`coalesce(${merchants.id}::text, 'none')`;
      const label = sql<string>`coalesce(${merchants.name}, 'Sem estabelecimento')`;
      return {
        key,
        label,
        color: sql<null>`null`,
        groupBy: [key, label],
      };
    }
    case 'tag': {
      const key = sql<string>`${tags.id}::text`;
      const label = sql<string>`${tags.name}`;
      const color = sql<string | null>`${tags.color}`;
      return {
        key,
        label,
        color,
        groupBy: [sql`${tags.id}`, sql`${tags.name}`, sql`${tags.color}`],
      };
    }
    case 'kind': {
      const key = sql<string>`${transactions.kind}::text`;
      return {
        key,
        label: key,
        color: sql<null>`null`,
        groupBy: [sql`${transactions.kind}`],
        mapLabel: (k) => KIND_LABELS[k as keyof typeof KIND_LABELS] ?? k,
      };
    }
  }
}
