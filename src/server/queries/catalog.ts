import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  categories,
  categorizationRules,
  merchants,
  tags,
  transactions,
  transactionTags,
} from '@/server/db/schema';
import type { CategoryKind, PaymentMethod, TxKind } from '@/server/domain/enums';

export type CategoryTree = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  archived: boolean;
  isSystem: boolean;
  sortOrder: number;
  transactionCount: number;
  children: CategoryTree[];
};

/**
 * Árvore de categorias (2 níveis, regra R8). As raízes de despesa e de receita vêm juntas;
 * separe pelo campo `kind` de cada nó.
 */
export async function listCategories(db: Db): Promise<CategoryTree[]> {
  const rows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      slug: categories.slug,
      kind: categories.kind,
      icon: categories.icon,
      color: categories.color,
      archived: categories.archived,
      isSystem: categories.isSystem,
      sortOrder: categories.sortOrder,
      transactionCount: sql<number>`count(${transactions.id})`,
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(eq(transactions.categoryId, categories.id), isNull(transactions.deletedAt))
    )
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const byId = new Map<string, CategoryTree>();
  const roots: CategoryTree[] = [];

  for (const r of rows) {
    const item: CategoryTree = {
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      slug: r.slug,
      kind: r.kind,
      icon: r.icon,
      color: r.color,
      archived: r.archived,
      isSystem: r.isSystem,
      sortOrder: r.sortOrder,
      transactionCount: Number(r.transactionCount ?? 0),
      children: [],
    };
    byId.set(r.id, item);
  }

  for (const item of byId.values()) {
    if (item.parentId && byId.has(item.parentId)) {
      byId.get(item.parentId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

export type RuleRow = {
  id: string;
  priority: number;
  matchField: 'description' | 'merchant';
  matchType: 'contains' | 'starts_with' | 'equals' | 'regex';
  pattern: string;
  accountId: string | null;
  accountName: string | null;
  amountMinCents: number | null;
  amountMaxCents: number | null;
  setCategoryId: string;
  categoryName: string;
  categoryColor: string;
  setKind: TxKind | null;
  setPaymentMethod: PaymentMethod | null;
  origin: string;
  hitCount: number;
  enabled: boolean;
};

export async function listRules(db: Db): Promise<RuleRow[]> {
  const rows = await db
    .select({
      id: categorizationRules.id,
      priority: categorizationRules.priority,
      matchField: categorizationRules.matchField,
      matchType: categorizationRules.matchType,
      pattern: categorizationRules.pattern,
      accountId: categorizationRules.accountId,
      accountName: accounts.name,
      amountMinCents: categorizationRules.amountMinCents,
      amountMaxCents: categorizationRules.amountMaxCents,
      setCategoryId: categorizationRules.setCategoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      setKind: categorizationRules.setKind,
      setPaymentMethod: categorizationRules.setPaymentMethod,
      origin: categorizationRules.origin,
      hitCount: categorizationRules.hitCount,
      enabled: categorizationRules.enabled,
    })
    .from(categorizationRules)
    .innerJoin(categories, eq(categories.id, categorizationRules.setCategoryId))
    .leftJoin(accounts, eq(accounts.id, categorizationRules.accountId))
    .orderBy(desc(categorizationRules.priority), desc(categorizationRules.createdAt));

  return rows.map((r) => ({
    id: r.id,
    priority: r.priority,
    matchField: r.matchField,
    matchType: r.matchType,
    pattern: r.pattern,
    accountId: r.accountId,
    accountName: r.accountName,
    amountMinCents: r.amountMinCents !== null ? Number(r.amountMinCents) : null,
    amountMaxCents: r.amountMaxCents !== null ? Number(r.amountMaxCents) : null,
    setCategoryId: r.setCategoryId,
    categoryName: r.categoryName,
    categoryColor: r.categoryColor,
    setKind: r.setKind,
    setPaymentMethod: r.setPaymentMethod,
    origin: r.origin,
    hitCount: r.hitCount,
    enabled: r.enabled,
  }));
}

export type TagWithCount = {
  id: string;
  name: string;
  color: string;
  transactionCount: number;
};

export async function listTags(db: Db): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      transactionCount: sql<number>`count(${transactionTags.transactionId})`,
    })
    .from(tags)
    .leftJoin(transactionTags, eq(transactionTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    transactionCount: Number(r.transactionCount ?? 0),
  }));
}

export type MerchantRow = {
  id: string;
  name: string;
  defaultCategory: { id: string; name: string } | null;
  transactionCount: number;
};

export async function listMerchants(
  db: Db,
  opts: { search?: string; limit?: number } = {}
): Promise<MerchantRow[]> {
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);

  let cond = undefined;
  if (opts.search) {
    cond = sql`lower(${merchants.name}) like ${'%' + opts.search.toLowerCase() + '%'}`;
  }

  const rows = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      defaultCategoryId: categories.id,
      defaultCategoryName: categories.name,
      transactionCount: sql<number>`count(${transactions.id})`,
    })
    .from(merchants)
    .leftJoin(categories, eq(categories.id, merchants.defaultCategoryId))
    .leftJoin(
      transactions,
      and(eq(transactions.merchantId, merchants.id), isNull(transactions.deletedAt))
    )
    .where(cond)
    .groupBy(merchants.id, categories.id)
    .orderBy(desc(sql`count(${transactions.id})`), asc(merchants.name))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    defaultCategory: r.defaultCategoryId
      ? { id: r.defaultCategoryId, name: r.defaultCategoryName! }
      : null,
    transactionCount: Number(r.transactionCount ?? 0),
  }));
}
