import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { merchants } from '@/server/db/schema';
import { normalizeForMatch } from './normalize/text';

/**
 * Procura merchant cujo `name` OU algum `alias`, normalizado, é igual ao nome informado.
 * Cria se não existir (`alias = rawAlias`). Ao achar um existente, acrescenta `rawAlias` a `aliases`
 * se ainda não estiver lá.
 */
export async function findOrCreateMerchant(
  db: Db,
  name: string,
  rawAlias: string,
): Promise<{ id: string; defaultCategoryId: string | null }> {
  const cleanName = name.trim();
  const cleanAlias = rawAlias.trim();
  const targetNorm = normalizeForMatch(cleanName);

  const allMerchants = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      aliases: merchants.aliases,
      defaultCategoryId: merchants.defaultCategoryId,
    })
    .from(merchants);

  const existing = allMerchants.find(
    (m) =>
      normalizeForMatch(m.name) === targetNorm ||
      m.aliases.some((alias) => normalizeForMatch(alias) === targetNorm),
  );

  if (existing) {
    if (cleanAlias && !existing.aliases.includes(cleanAlias)) {
      await db
        .update(merchants)
        .set({ aliases: [...existing.aliases, cleanAlias], updatedAt: new Date() })
        .where(eq(merchants.id, existing.id));
    }
    return { id: existing.id, defaultCategoryId: existing.defaultCategoryId };
  }

  const initialAliases = cleanAlias ? [cleanAlias] : [];
  const [created] = await db
    .insert(merchants)
    .values({
      name: cleanName,
      aliases: initialAliases,
    })
    .onConflictDoNothing()
    .returning({ id: merchants.id, defaultCategoryId: merchants.defaultCategoryId });

  if (created) {
    return created;
  }

  const [fallback] = await db
    .select({ id: merchants.id, defaultCategoryId: merchants.defaultCategoryId, aliases: merchants.aliases })
    .from(merchants)
    .where(eq(merchants.name, cleanName));

  if (fallback && cleanAlias && !fallback.aliases.includes(cleanAlias)) {
    await db
      .update(merchants)
      .set({ aliases: [...fallback.aliases, cleanAlias], updatedAt: new Date() })
      .where(eq(merchants.id, fallback.id));
  }

  return { id: fallback!.id, defaultCategoryId: fallback!.defaultCategoryId };
}
