import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { merchants, transactions } from '@/server/db/schema';
import type { CategorizationRule } from '@/server/domain/types';
import { categorizeTransactions, notUserCategorized } from './engine';
import { ruleMatches } from './rules';

/**
 * Aplica uma regra recém-salva nas transações existentes que casam com ela, passando pelo motor de categorização:
 * respeita R9 (categoria do usuário), R8 (natureza compatível, considerando o `setKind` da regra) e a precedência
 * entre regras (uma regra de prioridade maior continua vencendo). Assim o resultado imediato é o mesmo de um
 * reprocessamento futuro.
 *
 * Devolve quantas transações mudaram e ficaram com a categoria desta regra. Uma regra cuja categoria não é
 * compatível com as transações que casam (ex.: categoria de receita sobre despesas, sem `setKind`) devolve 0.
 * Regra desabilitada não aplica nada.
 */
export async function applyRuleToExisting(db: Db, rule: CategorizationRule): Promise<number> {
  if (!rule.enabled) return 0;

  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      description: transactions.description,
      descriptionRaw: transactions.descriptionRaw,
      merchantName: merchants.name,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      kind: transactions.kind,
      paymentMethod: transactions.paymentMethod,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(
      and(
        isNull(transactions.deletedAt),
        inArray(transactions.kind, ['expense', 'income', 'refund']),
        notUserCategorized(),
        rule.accountId ? eq(transactions.accountId, rule.accountId) : undefined,
      ),
    );

  const candidates = rows.filter((r) => ruleMatches(rule, r));
  if (candidates.length === 0) return 0;

  const ids = candidates.map((c) => c.id);
  await categorizeTransactions(db, ids);

  const after = await db
    .select({
      id: transactions.id,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      kind: transactions.kind,
      paymentMethod: transactions.paymentMethod,
    })
    .from(transactions)
    .where(inArray(transactions.id, ids));
  const before = new Map(candidates.map((c) => [c.id, c]));

  return after.filter((a) => {
    const b = before.get(a.id)!;
    const changed =
      a.categoryId !== b.categoryId ||
      a.categorySource !== b.categorySource ||
      a.kind !== b.kind ||
      a.paymentMethod !== b.paymentMethod;
    return changed && a.categorySource === 'rule' && a.categoryId === rule.setCategoryId;
  }).length;
}
