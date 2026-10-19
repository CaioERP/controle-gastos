// Montagem compartilhada pelos testes dos comandos (recategorize, upsertRule, archiveCategory). Não é usado em produção.
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import type { Db } from '../db/client';
import { seedBase } from '../db/seed';
import { accounts, categories, institutions, merchants, transactions } from '../db/schema';
import type { CategorySource, TxKind } from '../domain/enums';

export type TxOverrides = {
  description?: string;
  merchantId?: string | null;
  kind?: TxKind;
  amountCents?: number;
  categoryId?: string | null;
  categorySource?: CategorySource;
  needsReview?: boolean;
  installmentTotal?: number | null;
  userEditedFields?: string[];
};

/** Banco com o seed, uma conta corrente e atalhos para criar transações, estabelecimentos e categorias. */
export async function setupCommandsDb() {
  const db = await createTestDb();
  await seedBase(db);
  const [inst] = await db.select().from(institutions).limit(1);
  const [acc] = await db
    .insert(accounts)
    .values({ institutionId: inst!.id, type: 'checking', name: 'Conta Teste' })
    .returning();
  const catRows = await db.select().from(categories);
  const cat = (slug: string) => catRows.find((c) => c.slug === slug)!;

  let n = 0;
  async function insertTx(o: TxOverrides = {}) {
    n++;
    const description = o.description ?? 'Padaria Real';
    const [t] = await db
      .insert(transactions)
      .values({
        accountId: acc!.id,
        date: `2026-10-${String((n % 28) + 1).padStart(2, '0')}`,
        amountCents: o.amountCents ?? -2500,
        descriptionRaw: description.toUpperCase(),
        description,
        merchantId: o.merchantId ?? null,
        kind: o.kind ?? 'expense',
        paymentMethod: 'debit_card',
        categoryId: o.categoryId ?? null,
        categorySource: o.categorySource ?? 'default',
        needsReview: o.needsReview ?? true,
        installmentNumber: o.installmentTotal ? 1 : null,
        installmentTotal: o.installmentTotal ?? null,
        userEditedFields: o.userEditedFields ?? [],
      })
      .returning();
    return t!;
  }

  async function insertMerchant(name: string, defaultCategoryId: string | null = null) {
    const [m] = await db.insert(merchants).values({ name, defaultCategoryId }).returning();
    return m!;
  }

  async function newCategory(name: string, kind: 'expense' | 'income', parentId: string | null = null) {
    const [c] = await db
      .insert(categories)
      .values({ name, slug: name.toLowerCase().replace(/\s+/g, '-'), kind, icon: 'tag', color: '#123456', parentId })
      .returning();
    return c!;
  }

  const getTx = async (id: string) => (await db.select().from(transactions).where(eq(transactions.id, id)))[0]!;

  return { db: db as Db, acc: acc!, cat, insertTx, insertMerchant, newCategory, getTx };
}
