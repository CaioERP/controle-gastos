import { and, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '@/server/db/client';
import { accounts, categories, merchants, transactions } from '@/server/db/schema';
import { notSplitParent } from './split-filter';

export type SearchCategory = {
  id: string;
  name: string;
  parentName: string | null;
  color: string;
  icon: string;
};

export type SearchMerchant = {
  id: string;
  name: string;
};

export type SearchTransaction = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  accountName: string;
};

export type GlobalSearchResult = {
  categories: SearchCategory[];
  merchants: SearchMerchant[];
  transactions: SearchTransaction[];
};

export function escapeLike(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function globalSearch(db: Db, q: string): Promise<GlobalSearchResult> {
  const query = q.trim();
  if (query.length < 2) {
    return { categories: [], merchants: [], transactions: [] };
  }

  const escaped = escapeLike(query);
  const pattern = `%${escaped}%`;

  const parentCat = alias(categories, 'parent_categories');

  const [catRows, merchantRows, txRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        parentName: parentCat.name,
        color: categories.color,
        icon: categories.icon,
      })
      .from(categories)
      .leftJoin(parentCat, eq(parentCat.id, categories.parentId))
      .where(and(eq(categories.archived, false), ilike(categories.name, pattern)))
      .orderBy(categories.name)
      .limit(5),

    db
      .select({
        id: merchants.id,
        name: merchants.name,
      })
      .from(merchants)
      .where(ilike(merchants.name, pattern))
      .orderBy(merchants.name)
      .limit(5),

    db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        amountCents: transactions.amountCents,
        accountName: sql<string>`coalesce(${accounts.displayName}, ${accounts.name})`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          isNull(transactions.deletedAt),
          notSplitParent,
          eq(accounts.isHidden, false),
          ne(transactions.status, 'projected'),
          or(ilike(transactions.description, pattern), ilike(transactions.descriptionRaw, pattern))
        )
      )
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(8),
  ]);

  return {
    categories: catRows,
    merchants: merchantRows,
    transactions: txRows,
  };
}