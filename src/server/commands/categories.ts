import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { categories, categorizationRules, merchants, providerCategoryMap, transactions } from '@/server/db/schema';
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

/**
 * Mantém `categorization_rules.updated_at` em UPDATEs automáticos: o desempate entre regras (`sortRules`) usa essa
 * coluna como "última decisão do usuário ou aprendizado", e redirecionar ao arquivar não é uma nova decisão.
 */
const keepUpdatedAt = sql`${categorizationRules.updatedAt}`;

const archiveCategoryInput = z.object({
  categoryId: z.string().uuid(),
  moveTransactionsTo: z.string().uuid().nullable(),
});

/**
 * Arquiva a categoria (e as filhas, se for pai). Transações não excluídas na categoria ou nas filhas precisam de
 * destino (`moveTransactionsTo`, da mesma natureza); sem destino e com transações → `CONFLICT`.
 * Referências à categoria (regras, memória dos estabelecimentos, mapa de categorias da fonte) passam para o destino;
 * sem destino, as regras são desabilitadas e as referências zeradas.
 */
export async function archiveCategory(
  db: Db,
  input: z.infer<typeof archiveCategoryInput>,
): Promise<void> {
  const { categoryId, moveTransactionsTo } = archiveCategoryInput.parse(input);

  try {
    await db.transaction(async (tx) => {
      const [cat] = await tx
        .select({ id: categories.id, kind: categories.kind })
        .from(categories)
        .where(eq(categories.id, categoryId));
      if (!cat) throw new CommandError('NOT_FOUND', 'Categoria não encontrada');

      const children = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, categoryId));
      const ids = [categoryId, ...children.map((c) => c.id)];

      if (moveTransactionsTo) {
        const [dest] = await tx
          .select({ id: categories.id, kind: categories.kind, archived: categories.archived })
          .from(categories)
          .where(eq(categories.id, moveTransactionsTo));
        if (!dest) throw new CommandError('NOT_FOUND', 'Categoria de destino não encontrada');
        if (ids.includes(dest.id)) {
          throw new CommandError('VALIDATION', 'O destino não pode ser a própria categoria nem uma subcategoria dela');
        }
        if (dest.archived) throw new CommandError('VALIDATION', 'A categoria de destino está arquivada');
        if (dest.kind !== cat.kind) {
          throw new CommandError('VALIDATION', 'A categoria de destino deve ter a mesma natureza');
        }

        // As transações mantêm a origem. As de origem 'rule', 'merchant' e 'provider' continuam coerentes porque as
        // referências abaixo passam a apontar para o destino; sugestões da IA ou sem origem vão para a revisão.
        await tx
          .update(transactions)
          .set({
            categoryId: moveTransactionsTo,
            needsReview: sql`CASE WHEN ${transactions.categorySource} IN ('llm', 'default') THEN true ELSE ${transactions.needsReview} END`,
          })
          .where(inArray(transactions.categoryId, ids));
        await tx
          .update(categorizationRules)
          .set({ setCategoryId: moveTransactionsTo, updatedAt: keepUpdatedAt })
          .where(inArray(categorizationRules.setCategoryId, ids));
        await tx
          .update(merchants)
          .set({ defaultCategoryId: moveTransactionsTo })
          .where(inArray(merchants.defaultCategoryId, ids));
        await tx
          .update(providerCategoryMap)
          .set({ categoryId: moveTransactionsTo })
          .where(inArray(providerCategoryMap.categoryId, ids));
      } else {
        // Consulta interna por categoryId para validação antes de arquivar: confere se categoria possui transações
        const [inUse] = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(inArray(transactions.categoryId, ids), isNull(transactions.deletedAt)))
          .limit(1);
        if (inUse) {
          throw new CommandError('CONFLICT', 'Categoria em uso: escolha para onde mover as transações');
        }
        // Sem destino: as regras param de valer e as memórias/mapeamentos deixam de apontar para a categoria
        await tx
          .update(categorizationRules)
          .set({ enabled: false, updatedAt: keepUpdatedAt })
          .where(inArray(categorizationRules.setCategoryId, ids));
        await tx
          .update(merchants)
          .set({ defaultCategoryId: null })
          .where(inArray(merchants.defaultCategoryId, ids));
        await tx
          .update(providerCategoryMap)
          .set({ categoryId: null })
          .where(inArray(providerCategoryMap.categoryId, ids));
      }

      await tx.update(categories).set({ archived: true }).where(inArray(categories.id, ids));
    });
  } catch (err) {
    throw toCommandError(err);
  }
}
