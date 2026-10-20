import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { institutions } from '@/server/db/schema';

/** Tabela de apelidos para resolução de instituição. */
const INSTITUTION_ALIASES: Record<string, string> = {
  'nu pagamentos': 'nubank',
  'nubank': 'nubank',
  'itau unibanco': 'itau',
  'itau': 'itau',
  'itaú': 'itau',
  'itaú unibanco': 'itau',
  'mercadopago': 'mercado-pago',
  'mercado pago': 'mercado-pago',
  'banco inter': 'inter',
  'inter': 'inter',
  'pagseguro': 'pagbank',
  'pagbank': 'pagbank',
  'bradesco': 'bradesco',
  'banco do brasil': 'banco-do-brasil',
  'santander': 'santander',
  'caixa': 'caixa',
  'caixa economica federal': 'caixa',
  'c6 bank': 'c6',
  'c6': 'c6',
};

export function cleanName(name: string): string {
  let s = name.trim();
  const pattern = /\s+(s[\.\/]a[\.]?|ltda[\.]?)$/i;
  while (pattern.test(s)) {
    s = s.replace(pattern, '').trim();
  }
  return s;
}

export function slugify(name: string): string {
  const stripped = cleanName(name)
    .replace(/\b(banco)\b/gi, '')
    .trim();

  return stripped
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function resolveInstitution(
  db: Db,
  name: string,
  pluggyConnectorId?: number | null,
): Promise<{ id: string; slug: string }> {
  const cleaned = cleanName(name);
  const norm = cleaned
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Verifica na tabela de apelidos ou gera o slug
  const targetSlug = INSTITUTION_ALIASES[norm] ?? slugify(name);

  // Busca por slug
  const [existing] = await db
    .select({ id: institutions.id, slug: institutions.slug })
    .from(institutions)
    .where(eq(institutions.slug, targetSlug));

  if (existing) {
    if (pluggyConnectorId) {
      await db
        .update(institutions)
        .set({ pluggyConnectorId, updatedAt: new Date() })
        .where(eq(institutions.id, existing.id));
    }
    return existing;
  }

  // Se não existir, cria com cor padrão cinza (#6B7280)
  const displayName = cleanName(name);
  const [created] = await db
    .insert(institutions)
    .values({
      name: displayName,
      slug: targetSlug,
      color: '#6B7280',
      pluggyConnectorId: pluggyConnectorId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: institutions.id, slug: institutions.slug });

  if (created) {
    return created;
  }

  const [fallback] = await db
    .select({ id: institutions.id, slug: institutions.slug })
    .from(institutions)
    .where(eq(institutions.slug, targetSlug));

  return fallback!;
}
