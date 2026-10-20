import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { categories, categorizationRules, merchants, transactions, transactionSources } from '@/server/db/schema';
import type { CategoryKind, CategorySource, PaymentMethod, Source, TxKind } from '@/server/domain/enums';
import type { CategorizationRule } from '@/server/domain/types';
import { loadProviderMap, providerMapKey } from './provider-map';
import { ruleMatches, sortRules } from './rules';

/** Categorizador por IA (A1-07): recebe os ids que as camadas determinísticas não resolveram. */
export type LlmCategorizer = (db: Db, txIds: string[]) => Promise<unknown>;
export type CategorizeOptions = { llm?: LlmCategorizer };
export type CategorizeResult = { byRule: number; byMerchant: number; byProvider: number; pending: number };

const CONFIDENCE = { rule: 1, merchant: 0.95, provider: 0.7 } as const;

/** Natureza de categoria aceita pela transação: receita só em `income`; despesa em `expense` e `refund`. */
export function categoryKindFor(kind: TxKind): CategoryKind | null {
  if (kind === 'income') return 'income';
  if (kind === 'expense' || kind === 'refund') return 'expense';
  return null;
}

/**
 * Guarda de R9 no próprio `UPDATE`: se o usuário recategorizou entre a leitura e a escrita, a linha não é tocada.
 * Use em toda escrita automática de categoria.
 */
export function notUserCategorized() {
  return and(
    ne(transactions.categorySource, 'user'),
    sql`NOT ('category' = ANY(${transactions.userEditedFields}))`,
  );
}

type Decision = {
  categoryId: string;
  source: Extract<CategorySource, 'rule' | 'merchant' | 'provider'>;
  rule?: CategorizationRule;
};

const sameConfidence = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 1e-6;

/**
 * Categoriza as transações informadas, em camadas (a primeira que resolver vence):
 * 1. regra (`categorization_rules`)  2. memória do estabelecimento  3. categoria da fonte (`provider_category_map`).
 * O que nenhuma camada resolver vai para `opts.llm`, se fornecido.
 *
 * Nunca toca em transação com categoria do usuário (R9), nem em naturezas sem categoria (R8).
 * Não rebaixa: uma sugestão da IA não é trocada pela categoria da fonte, que tem confiança menor.
 * Idempotente: se o resultado é igual ao que já está gravado, a transação não é regravada (reprocessar não
 * reabre a revisão de uma sugestão que o usuário já aceitou).
 */
export async function categorizeTransactions(
  db: Db,
  txIds: string[],
  opts: CategorizeOptions = {},
): Promise<CategorizeResult> {
  const result: CategorizeResult = { byRule: 0, byMerchant: 0, byProvider: 0, pending: 0 };
  if (txIds.length === 0) return result;

  const [rows, rules, categoryRows, providerMap, sourceRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        amountCents: transactions.amountCents,
        description: transactions.description,
        descriptionRaw: transactions.descriptionRaw,
        kind: transactions.kind,
        paymentMethod: transactions.paymentMethod,
        categoryId: transactions.categoryId,
        categorySource: transactions.categorySource,
        categoryConfidence: transactions.categoryConfidence,
        needsReview: transactions.needsReview,
        userEditedFields: transactions.userEditedFields,
        providerCategoryId: transactions.providerCategoryId,
        merchantName: merchants.name,
        merchantDefaultCategoryId: merchants.defaultCategoryId,
      })
      .from(transactions)
      .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
      .where(and(inArray(transactions.id, txIds), isNull(transactions.deletedAt))),
    db.select().from(categorizationRules).where(eq(categorizationRules.enabled, true)),
    db
      .select({ id: categories.id, kind: categories.kind })
      .from(categories)
      .where(eq(categories.archived, false)),
    loadProviderMap(db),
    db
      .select({ transactionId: transactionSources.transactionId, source: transactionSources.source })
      .from(transactionSources)
      .where(inArray(transactionSources.transactionId, txIds)),
  ]);

  const sortedRules = sortRules(rules);
  const kindByCategory = new Map(categoryRows.map((c) => [c.id, c.kind]));
  const sourcesByTx = new Map<string, Source[]>();
  for (const s of sourceRows) sourcesByTx.set(s.transactionId, [...(sourcesByTx.get(s.transactionId) ?? []), s.source]);

  const ruleHits = new Map<string, number>();
  const pending: string[] = [];

  await db.transaction(async (tx) => {
    for (const t of rows) {
      const wanted = categoryKindFor(t.kind);
      if (!wanted) continue;
      if (t.categorySource === 'user' || t.userEditedFields.includes('category')) continue;

      const kindEdited = t.userEditedFields.includes('kind');
      const paymentEdited = t.userEditedFields.includes('paymentMethod');
      const compatible = (id: string | null | undefined, expected: CategoryKind | null = wanted): id is string =>
        !!id && expected !== null && kindByCategory.get(id) === expected;
      // A categoria da regra é conferida com a natureza que a transação TERÁ depois da regra
      const kindAfter = (r: CategorizationRule): TxKind => (r.setKind && !kindEdited ? r.setKind : t.kind);

      const ruleTx = {
        description: t.description,
        descriptionRaw: t.descriptionRaw,
        merchantName: t.merchantName,
        accountId: t.accountId,
        amountCents: t.amountCents,
      };
      let decision: Decision | null = null;

      const rule = sortedRules.find(
        (r) => compatible(r.setCategoryId, categoryKindFor(kindAfter(r))) && ruleMatches(r, ruleTx),
      );
      if (rule) {
        decision = { categoryId: rule.setCategoryId, source: 'rule', rule };
      } else if (compatible(t.merchantDefaultCategoryId)) {
        decision = { categoryId: t.merchantDefaultCategoryId, source: 'merchant' };
      } else if (t.categorySource !== 'llm' && t.providerCategoryId) {
        const mapped = (sourcesByTx.get(t.id) ?? [])
          .map((source) => providerMap.get(providerMapKey(source, t.providerCategoryId!)))
          .find((id) => compatible(id));
        if (mapped) decision = { categoryId: mapped, source: 'provider' };
      }

      if (!decision) {
        if (!t.categoryId || t.categorySource === 'default') {
          pending.push(t.id);
          result.pending++;
          if (!t.categoryId && !t.needsReview) {
            await tx
              .update(transactions)
              .set({ needsReview: true })
              .where(and(eq(transactions.id, t.id), isNull(transactions.categoryId)));
          }
        }
        continue;
      }

      if (decision.source === 'rule') result.byRule++;
      else if (decision.source === 'merchant') result.byMerchant++;
      else result.byProvider++;

      const confidence = CONFIDENCE[decision.source];
      let kind: TxKind = t.kind;
      let paymentMethod: PaymentMethod = t.paymentMethod;
      if (decision.rule) {
        kind = kindAfter(decision.rule);
        if (decision.rule.setPaymentMethod && !paymentEdited) paymentMethod = decision.rule.setPaymentMethod;
      }

      const unchanged =
        decision.categoryId === t.categoryId &&
        decision.source === t.categorySource &&
        sameConfidence(t.categoryConfidence, confidence) &&
        kind === t.kind &&
        paymentMethod === t.paymentMethod;
      if (unchanged) continue;

      const update: Partial<typeof transactions.$inferInsert> = {
        categoryId: decision.categoryId,
        categorySource: decision.source,
        categoryConfidence: confidence,
        needsReview: decision.source === 'provider',
      };
      if (kind !== t.kind) update.kind = kind;
      if (paymentMethod !== t.paymentMethod) update.paymentMethod = paymentMethod;

      const written = await tx
        .update(transactions)
        .set(update)
        .where(and(eq(transactions.id, t.id), notUserCategorized()))
        .returning({ id: transactions.id });

      // Só conta acerto quando a regra muda a categoria; reprocessar não infla o contador
      if (decision.rule && written.length > 0 && (t.categorySource !== 'rule' || t.categoryId !== decision.categoryId)) {
        ruleHits.set(decision.rule.id, (ruleHits.get(decision.rule.id) ?? 0) + 1);
      }
    }

    for (const [ruleId, hits] of ruleHits) {
      await tx
        .update(categorizationRules)
        // Preserva updated_at: contar acertos não é decisão do usuário (ver desempate em sortRules)
        .set({ hitCount: sql`${categorizationRules.hitCount} + ${hits}`, updatedAt: sql`${categorizationRules.updatedAt}` })
        .where(eq(categorizationRules.id, ruleId));
    }
  });

  if (opts.llm && pending.length > 0) await opts.llm(db, pending);
  return result;
}
