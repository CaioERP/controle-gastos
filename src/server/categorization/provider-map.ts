import { isNotNull, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { categories, providerCategoryMap } from '@/server/db/schema';
import type { Source } from '@/server/domain/enums';
import { PLUGGY_CATEGORY_SEED, type ProviderCategorySeed } from './pluggy-category-seed';

export function providerMapKey(provider: Source, providerCategoryId: string): string {
  return `${provider}:${providerCategoryId}`;
}

/** Mapa `provider:providerCategoryId` → nossa categoria (só entradas com categoria definida). */
export async function loadProviderMap(db: Db): Promise<Map<string, string>> {
  const rows = await db
    .select({
      provider: providerCategoryMap.provider,
      providerCategoryId: providerCategoryMap.providerCategoryId,
      categoryId: providerCategoryMap.categoryId,
    })
    .from(providerCategoryMap)
    .where(isNotNull(providerCategoryMap.categoryId));
  return new Map(rows.map((r) => [providerMapKey(r.provider, r.providerCategoryId), r.categoryId!]));
}

/**
 * Grava o mapa de categorias da Pluggy. Idempotente; slug desconhecido é erro de configuração.
 * Ao rodar de novo, não troca uma categoria ativa já gravada (ver o conflito abaixo): correções futuras do seed
 * exigem uma migração de dados.
 */
export async function seedProviderCategoryMap(
  db: Db,
  seed: readonly ProviderCategorySeed[] = PLUGGY_CATEGORY_SEED,
): Promise<number> {
  if (seed.length === 0) return 0;
  const slugRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const idBySlug = new Map(slugRows.map((r) => [r.slug, r.id]));

  for (const entry of seed) {
    let categoryId: string | null = null;
    if (entry.categorySlug !== null) {
      categoryId = idBySlug.get(entry.categorySlug) ?? null;
      if (!categoryId) throw new Error(`Mapa da Pluggy aponta para categoria inexistente: ${entry.categorySlug}`);
    }
    await db
      .insert(providerCategoryMap)
      .values({
        provider: 'pluggy',
        providerCategoryId: entry.providerCategoryId,
        providerCategoryName: entry.providerCategoryName,
        categoryId,
      })
      .onConflictDoUpdate({
        target: [providerCategoryMap.provider, providerCategoryMap.providerCategoryId],
        // Não desfaz um mapeamento já apontando para categoria ativa (ex.: redirecionado por archiveCategory ou
        // ajustado pelo usuário): o seed só preenche entradas sem categoria ou com categoria arquivada.
        // Consequência: rodar o seed de novo NÃO troca uma categoria ativa por outra ativa. Corrigir uma entrada
        // do seed já gravada em bancos existentes exige uma migração de dados, não basta editar o seed.
        set: {
          providerCategoryName: entry.providerCategoryName,
          categoryId: sql`CASE WHEN EXISTS (
            SELECT 1 FROM ${categories} c
            WHERE c.id = "provider_category_map"."category_id" AND c.archived = false
          ) THEN "provider_category_map"."category_id" ELSE excluded.category_id END`,
        },
      });
  }
  return seed.length;
}
