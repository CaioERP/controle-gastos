import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { categories, categorizationRules, merchants, transactions, transactionSources } from '@/server/db/schema';
import type { CategoryKind, CategorySource, Source, TxKind } from '@/server/domain/enums';
import type { CategorizationRule } from '@/server/domain/types';
import { loadProviderMap, providerMapKey } from './provider-map';
import { pickRule } from './rules';

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

type Decision = {
  categoryId: string;
  source: Extract<CategorySource, 'rule' | 'merchant' | 'provider'>;
  rule?: CategorizationRule;
};

/**
 * Categoriza as transações informadas, em camadas (a primeira que resolver vence):
 * 1. regra (`categorization_rules`)  2. memória do estabelecimento  3. categoria da fonte (`provider_category_map`).
 * O que nenhuma camada resolver vai para `opts.llm`, se fornecido.
 *
 * Nunca toca em transação com categoria do usuário (R9), nem em naturezas sem categoria (R8).
 * Não rebaixa: uma sugestão da IA não é trocada pela categoria da fonte, que tem confiança menor.
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
        categoryId: transactions.categoryId,
        categorySource: transactions.categorySource,
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

      const compatible = (id: string | null | undefined): id is string => !!id && kindByCategory.get(id) === wanted;
      let decision: Decision | null = null;

      const rule = pickRule(
        rules.filter((r) => compatible(r.setCategoryId)),
        {
          description: t.description,
          descriptionRaw: t.descriptionRaw,
          merchantName: t.merchantName,
          accountId: t.accountId,
          amountCents: t.amountCents,
        },
      );
      if (rule) {
        decision = { categoryId: rule.setCategoryId, source: 'rule', rule };
      } else if (compatible(t.merchantDefaultCategoryId)) {
        decision = { categoryId: t.merchantDefaultCategoryId, source: 'merchant' };
      } else if (t.categorySource !== 'llm' && t.providerCategoryId) {
        const mapped = (sourcesByTx.get(t.id) ?? [])
          .map((source) => providerMap.get(providerMapKey(source, t.providerCategoryId!)))
          .find(compatible);
        if (mapped) decision = { categoryId: mapped, source: 'provider' };
      }

      if (!decision) {
        if (!t.categoryId || t.categorySource === 'default') {
          pending.push(t.id);
          result.pending++;
          if (!t.categoryId) {
            await tx.update(transactions).set({ needsReview: true }).where(eq(transactions.id, t.id));
          }
        }
        continue;
      }

      const update: Partial<typeof transactions.$inferInsert> = {
        categoryId: decision.categoryId,
        categorySource: decision.source,
        categoryConfidence: CONFIDENCE[decision.source],
        needsReview: decision.source === 'provider',
      };
      if (decision.rule) {
        if (decision.rule.setKind && !t.userEditedFields.includes('kind')) update.kind = decision.rule.setKind;
        if (decision.rule.setPaymentMethod && !t.userEditedFields.includes('paymentMethod')) {
          update.paymentMethod = decision.rule.setPaymentMethod;
        }
        // Só conta acerto quando a regra muda algo; reprocessar não infla o contador
        const changed = t.categorySource !== 'rule' || t.categoryId !== decision.categoryId;
        if (changed) ruleHits.set(decision.rule.id, (ruleHits.get(decision.rule.id) ?? 0) + 1);
      }
      await tx.update(transactions).set(update).where(eq(transactions.id, t.id));

      if (decision.source === 'rule') result.byRule++;
      else if (decision.source === 'merchant') result.byMerchant++;
      else result.byProvider++;
    }

    for (const [ruleId, hits] of ruleHits) {
      await tx
        .update(categorizationRules)
        .set({ hitCount: sql`${categorizationRules.hitCount} + ${hits}` })
        .where(eq(categorizationRules.id, ruleId));
    }
  });

  if (opts.llm && pending.length > 0) await opts.llm(db, pending);
  return result;
}
