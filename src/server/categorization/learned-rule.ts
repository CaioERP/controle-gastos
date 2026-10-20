import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { categorizationRules } from '@/server/db/schema';
import type { CategorizationRule } from '@/server/domain/types';
import { normalizeForMatch } from '@/server/ingestion/normalize/text';

const PARC_SUFFIX = /\s*-?\s*\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i;
const BARE_SUFFIX = /\s+(\d{1,2})\/(\d{1,2})\s*$/;

/** Tamanho mínimo (normalizado) da descrição-base para virar regra `starts_with`. */
const MIN_STARTS_WITH = 8;

const validInstallment = (n: number, m: number) => m >= 2 && n >= 1 && n <= m;

/**
 * Descrição sem o sufixo de parcela no final. Só remove:
 * - "PARC 03/10", "Parcela 3 de 10" (com o prefixo explícito), com 1 ≤ n ≤ m e m ≥ 2;
 * - " 3/10" sem prefixo **apenas** se a transação for parcelada (`installmentTotal > 1`) e `m` bater com o total.
 * Assim datas no fim ("PAGAMENTO 15/10", "Pix enviado 10/10", "LOJA X12/10") nunca são tratadas como parcela.
 */
export function descriptionBase(description: string, installmentTotal: number | null): string {
  const text = description.trim();
  const parc = PARC_SUFFIX.exec(text);
  if (parc && validInstallment(Number(parc[1]), Number(parc[2]))) {
    return text.slice(0, parc.index).trim() || text;
  }
  const bare = BARE_SUFFIX.exec(text);
  if (bare && installmentTotal !== null && installmentTotal > 1) {
    const n = Number(bare[1]);
    const m = Number(bare[2]);
    if (validInstallment(n, m) && m === installmentTotal) return text.slice(0, bare.index).trim() || text;
  }
  return text;
}

/**
 * Palavras que não identificam o que foi comprado: forma de pagamento, termos de parcelamento, conectivos e
 * marketplaces/intermediadores que vendem de tudo. Uma descrição-base feita só delas ("Compra parcelada",
 * "Mercado Livre", "Pagamento Pix") viraria um `starts_with` que pega compras de qualquer categoria.
 * Lista curta de propósito: só termos que aparecem como prefixo genérico nas descrições bancárias.
 */
const GENERIC_WORDS = new Set([
  // operação / forma de pagamento
  'compra', 'compras', 'parcelada', 'parcelado', 'parcela', 'parc', 'pagamento', 'pagto', 'pag', 'pix', 'ted', 'doc',
  'transferencia', 'debito', 'credito', 'cartao', 'boleto', 'online', 'internet', 'loja', 'enviado', 'recebido',
  // marketplaces e intermediadores
  'mercado', 'livre', 'mercadolivre', 'pago', 'mercadopago', 'amazon', 'shopee', 'aliexpress', 'magalu',
  'americanas', 'picpay', 'paypal', 'pagseguro',
  // conectivos
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'com', 'a', 'o',
]);

/** A descrição-base tem algo que identifique a compra (pelo menos 3 letras fora das palavras genéricas)? */
function isDistinctive(base: string): boolean {
  const distinctive = normalizeForMatch(base)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !GENERIC_WORDS.has(w));
  return distinctive.join('').length >= 3;
}

export type LearnedMatch = Pick<CategorizationRule, 'matchField' | 'matchType' | 'pattern'>;

/**
 * Padrão da regra aprendida a partir de uma transação recategorizada pelo usuário:
 * - com estabelecimento → `merchant` `equals` nome;
 * - parcela com descrição-base de pelo menos 8 caracteres e com algum termo distintivo (não só palavras genéricas,
 *   ver `GENERIC_WORDS`) → `description` `starts_with` base (pega as outras parcelas);
 * - senão → `description` `equals` descrição inteira (nunca um `contains` genérico).
 */
export function learnedMatchFor(tx: {
  description: string;
  installmentTotal: number | null;
  merchantName: string | null;
}): LearnedMatch {
  if (tx.merchantName) return { matchField: 'merchant', matchType: 'equals', pattern: tx.merchantName };
  const text = tx.description.trim();
  const base = descriptionBase(text, tx.installmentTotal);
  if (base !== text && normalizeForMatch(base).length >= MIN_STARTS_WITH && isDistinctive(base)) {
    return { matchField: 'description', matchType: 'starts_with', pattern: base };
  }
  return { matchField: 'description', matchType: 'equals', pattern: text };
}

/**
 * Grava a regra aprendida. Se já existe uma regra `learned` com o mesmo critério (campo, tipo, padrão normalizado e
 * sem conta), ela é atualizada (nova categoria, reativada) em vez de duplicada: vale sempre a última correção.
 */
export async function saveLearnedRule(db: Db, match: LearnedMatch, categoryId: string): Promise<CategorizationRule> {
  const sameCriteria = await db
    .select()
    .from(categorizationRules)
    .where(
      and(
        eq(categorizationRules.origin, 'learned'),
        eq(categorizationRules.matchField, match.matchField),
        eq(categorizationRules.matchType, match.matchType),
        isNull(categorizationRules.accountId),
      ),
    );
  const pattern = normalizeForMatch(match.pattern);
  const existing = sameCriteria.find((r) => normalizeForMatch(r.pattern) === pattern);

  if (existing) {
    const [updated] = await db
      .update(categorizationRules)
      .set({ setCategoryId: categoryId, enabled: true })
      .where(eq(categorizationRules.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(categorizationRules)
    .values({ ...match, setCategoryId: categoryId, origin: 'learned' })
    .returning();
  return created!;
}
