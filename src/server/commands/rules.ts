import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { categorizeTransactions, notUserCategorized } from '@/server/categorization/engine';
import { ruleMatches } from '@/server/categorization/rules';
import type { Db } from '@/server/db/client';
import { categorizationRules, merchants, transactions } from '@/server/db/schema';
import { PAYMENT_METHODS, TX_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';
import type { CategorizationRule } from '@/server/domain/types';

export type RuleInput = {
  id?: string;
  priority: number;
  matchField: 'description' | 'merchant';
  matchType: 'contains' | 'starts_with' | 'equals' | 'regex';
  pattern: string;
  accountId: string | null;
  amountMinCents: number | null;
  amountMaxCents: number | null;
  setCategoryId: string;
  setKind: TxKind | null;
  setPaymentMethod: PaymentMethod | null;
  enabled: boolean;
};

const ruleInputSchema = z.object({
  id: z.string().uuid().optional(),
  priority: z.number().int().default(0),
  matchField: z.enum(['description', 'merchant']),
  matchType: z.enum(['contains', 'starts_with', 'equals', 'regex']),
  pattern: z.string().min(1),
  accountId: z.string().uuid().nullable(),
  amountMinCents: z.number().int().nullable(),
  amountMaxCents: z.number().int().nullable(),
  setCategoryId: z.string().uuid(),
  setKind: z.enum(TX_KINDS).nullable(),
  setPaymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  enabled: z.boolean().default(true),
});

export async function upsertRule(
  db: Db,
  input: RuleInput,
): Promise<{ id: string; applied: number }> {
  const data = ruleInputSchema.parse(input);

  if (data.matchType === 'regex') {
    try {
      new RegExp(data.pattern);
    } catch {
      throw new CommandError('VALIDATION', 'Expressão regular inválida no padrão da regra');
    }
  }

  if (data.amountMinCents !== null && data.amountMaxCents !== null) {
    if (data.amountMinCents > data.amountMaxCents) {
      throw new CommandError('VALIDATION', 'amountMinCents deve ser menor ou igual a amountMaxCents');
    }
  }

  try {
    return await db.transaction(async (tx) => {
      let rule: CategorizationRule;
      if (data.id) {
        const { id, ...fields } = data;
        const [updated] = await tx
          .update(categorizationRules)
          .set(fields)
          .where(eq(categorizationRules.id, id))
          .returning();
        if (!updated) throw new CommandError('NOT_FOUND', 'Regra não encontrada');
        rule = updated;
      } else {
        const [created] = await tx.insert(categorizationRules).values(data).returning();
        rule = created!;
      }
      const applied = rule.enabled ? await applyRuleToExisting(tx, rule) : 0;
      return { id: rule.id, applied };
    });
  } catch (err) {
    throw toCommandError(err);
  }
}

type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Aplica a regra nas transações existentes que casam com ela, passando pelo motor de categorização (que respeita
 * R9, R8 e a precedência entre regras). Devolve quantas transações passaram a usar a categoria desta regra.
 */
async function applyRuleToExisting(tx: DbTx, rule: CategorizationRule): Promise<number> {
  const rows = await tx
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
  await categorizeTransactions(tx, ids);

  const after = await tx
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

const deleteRuleInput = z.object({
  ruleId: z.string().uuid(),
});

export async function deleteRule(db: Db, input: z.infer<typeof deleteRuleInput>): Promise<void> {
  const { ruleId } = deleteRuleInput.parse(input);
  const res = await db
    .delete(categorizationRules)
    .where(eq(categorizationRules.id, ruleId))
    .returning({ id: categorizationRules.id });
  if (res.length === 0) throw new CommandError('NOT_FOUND', 'Regra não encontrada');
}
