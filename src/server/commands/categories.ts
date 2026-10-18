import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { categories, transactions } from '@/server/db/schema';
import { CATEGORY_KINDS } from '@/server/domain/enums';
import { CommandError } from '@/server/domain/errors';

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const upsertCategoryInput = z.object({
  id: z.string().uuid().optional(),
  parentId: z.string().uuid().nullable(),
  name: z.string().min(1).max(100),
  kind: z.enum(CATEGORY_KINDS),
  icon: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor hex inválida'),
  archived: z.boolean().optional(),
});

export async function upsertCategory(
  db: Db,
  input: z.infer<typeof upsertCategoryInput>,
): Promise<{ id: string }> {
  const data = upsertCategoryInput.parse(input);
  if (data.id) {
    const res = await db
      .update(categories)
      .set({
        name: data.name,
        parentId: data.parentId,
        kind: data.kind,
        icon: data.icon,
        color: data.color,
        ...(data.archived !== undefined ? { archived: data.archived } : {}),
      })
      .where(eq(categories.id, data.id))
      .returning({ id: categories.id });
    if (res.length === 0) throw new CommandError('NOT_FOUND', 'Categoria não encontrada');
    return { id: res[0]!.id };
  }

  let slug = slugify(data.name);
  if (data.parentId) {
    const [parent] = await db
      .select({ slug: categories.slug })
      .from(categories)
      .where(eq(categories.id, data.parentId));
    if (!parent) throw new CommandError('NOT_FOUND', 'Categoria pai não encontrada');
    if (!slug.startsWith(parent.slug)) {
      slug = `${parent.slug}-${slug}`;
    }
  }

  const [created] = await db
    .insert(categories)
    .values({
      name: data.name,
      slug,
      parentId: data.parentId,
      kind: data.kind,
      icon: data.icon,
      color: data.color,
      archived: data.archived ?? false,
    })
    .returning({ id: categories.id });

  return { id: created!.id };
}

const archiveCategoryInput = z.object({
  categoryId: z.string().uuid(),
  moveTransactionsTo: z.string().uuid().nullable(),
});

export async function archiveCategory(
  db: Db,
  input: z.infer<typeof archiveCategoryInput>,
): Promise<void> {
  const { categoryId, moveTransactionsTo } = archiveCategoryInput.parse(input);

  await db.transaction(async (tx) => {
    const [cat] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId));
    if (!cat) throw new CommandError('NOT_FOUND', 'Categoria não encontrada');

    if (moveTransactionsTo) {
      const [dest] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, moveTransactionsTo));
      if (!dest) throw new CommandError('NOT_FOUND', 'Categoria de destino não encontrada');

      await tx
        .update(transactions)
        .set({ categoryId: moveTransactionsTo })
        .where(eq(transactions.categoryId, categoryId));
    }

    await tx.update(categories).set({ archived: true }).where(eq(categories.id, categoryId));
  });
}
