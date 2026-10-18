import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { categories, transactions } from '@/server/db/schema';
import { CATEGORY_KINDS } from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';

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

  // 1. Categoria não pode ser pai de si mesma
  if (data.id && data.parentId && data.id === data.parentId) {
    throw new CommandError('VALIDATION', 'Categoria não pode ser pai de si mesma');
  }

  // Na edição, a natureza é imutável: filhas e transações já categorizadas ficariam incompatíveis
  if (data.id) {
    const [current] = await db
      .select({ kind: categories.kind })
      .from(categories)
      .where(eq(categories.id, data.id));
    if (!current) throw new CommandError('NOT_FOUND', 'Categoria não encontrada');
    if (current.kind !== data.kind) {
      throw new CommandError('VALIDATION', 'Não é possível mudar a natureza de uma categoria existente');
    }
  }

  // 2. Validações quando parentId é informado
  let parentSlug: string | undefined;
  if (data.parentId) {
    const [parent] = await db
      .select({
        id: categories.id,
        slug: categories.slug,
        parentId: categories.parentId,
        kind: categories.kind,
      })
      .from(categories)
      .where(eq(categories.id, data.parentId));

    if (!parent) {
      throw new CommandError('NOT_FOUND', 'Categoria pai não encontrada');
    }

    // Regra R8: máximo 2 níveis (o pai tem que ser raiz, ou seja, parent.parentId === null)
    if (parent.parentId !== null) {
      throw new CommandError('VALIDATION', 'Categorias podem ter no máximo 2 níveis');
    }

    // kind deve ser idêntico ao do pai
    if (data.kind !== parent.kind) {
      throw new CommandError('VALIDATION', 'Categoria filha deve ter a mesma natureza da categoria pai');
    }

    parentSlug = parent.slug;
  }

  // 3. Na edição, validar que categoria com filhas não pode receber pai
  if (data.id && data.parentId !== null) {
    const children = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, data.id));

    if (children.length > 0) {
      throw new CommandError('VALIDATION', 'Categoria com subcategorias não pode se tornar filha');
    }
  }

  try {
    if (data.id) {
      // O slug é imutável depois da criação: seed, dados fictícios e mapa de categorias da fonte
      // localizam categorias por ele. Renomear muda só o nome exibido.
      const res = await db
        .update(categories)
        .set({
          name: data.name,
          parentId: data.parentId,
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
    if (parentSlug && !slug.startsWith(parentSlug)) {
      slug = `${parentSlug}-${slug}`;
    }

    // Criação: verificar se slug já existe
    const [existingSlug] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug));
    if (existingSlug) {
      throw new CommandError('CONFLICT', 'Já existe uma categoria com esse nome');
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
  } catch (err) {
    throw toCommandError(err);
  }
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
