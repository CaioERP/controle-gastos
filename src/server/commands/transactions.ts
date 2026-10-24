import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applyRuleToExisting } from '@/server/categorization/apply-rule';
import { categoryKindFor, notUserCategorized } from '@/server/categorization/engine';
import { descriptionBase, learnedMatchFor, saveLearnedRule } from '@/server/categorization/learned-rule';
import type { Db } from '@/server/db/client';
import { categories, merchants, transactions, transactionTags } from '@/server/db/schema';
import { PAYMENT_METHODS, TX_KINDS, type CategoryKind, type TxKind } from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';
import { normalizeForMatch } from '@/server/ingestion/normalize/text';

/** Adiciona campos a user_edited_fields sem duplicar (regra R9). */
export function markEdited(fields: string[]) {
  let expr = sql`${transactions.userEditedFields}`;
  for (const f of fields) expr = sql`array_append(array_remove(${expr}, ${f}), ${f})`;
  return expr;
}

const recategorizeInput = z.object({
  transactionId: z.string().uuid(),
  categoryId: z.string().uuid(),
  scope: z.enum(['this', 'similar', 'rule']),
});

type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Transações parecidas com a de origem que podem receber a categoria: mesmo estabelecimento (ou, sem
 * estabelecimento, mesma descrição sem a parcela), não excluídas, de natureza compatível com a categoria e sem
 * categoria do usuário (R9).
 */
async function similarTransactionIds(
  tx: DbTx,
  origin: { id: string; merchantId: string | null; description: string; installmentTotal: number | null },
  categoryKind: CategoryKind,
): Promise<string[]> {
  const kinds: TxKind[] = categoryKind === 'income' ? ['income'] : ['expense', 'refund'];
  const rows = await tx
    .select({
      id: transactions.id,
      description: transactions.description,
      installmentTotal: transactions.installmentTotal,
    })
    // Busca transações similares pelo mesmo estabelecimento para recategorização em lote
    .from(transactions)
    .where(
      and(
        ne(transactions.id, origin.id),
        isNull(transactions.deletedAt),
        inArray(transactions.kind, kinds),
        notUserCategorized(),
        origin.merchantId ? eq(transactions.merchantId, origin.merchantId) : isNull(transactions.merchantId),
      ),
    );
  if (origin.merchantId) return rows.map((r) => r.id);
  const base = normalizeForMatch(descriptionBase(origin.description, origin.installmentTotal));
  return rows
    .filter((r) => normalizeForMatch(descriptionBase(r.description, r.installmentTotal)) === base)
    .map((r) => r.id);
}

/** Grava a memória do estabelecimento nos ids, com a guarda de R9 no `WHERE`. Não regrava (nem conta) as que já estão iguais. */
async function applyMerchantCategory(tx: DbTx, ids: string[], categoryId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await tx
    .update(transactions)
    .set({ categoryId, categorySource: 'merchant', categoryConfidence: 0.95, needsReview: false })
    .where(
      and(
        inArray(transactions.id, ids),
        notUserCategorized(),
        or(
          isNull(transactions.categoryId),
          ne(transactions.categoryId, categoryId),
          ne(transactions.categorySource, 'merchant'),
          eq(transactions.needsReview, true),
        ),
      ),
    )
    .returning({ id: transactions.id });
  return res.length;
}

/**
 * Recategoriza uma transação (correção do usuário, R9) e grava a memória do estabelecimento.
 * - `this`: só a transação.
 * - `similar`: também as do mesmo estabelecimento (ou, sem estabelecimento, mesma descrição sem a parcela),
 *   que recebem `categorySource: 'merchant'`. Se alguma delas casar com uma regra, um reprocessamento futuro
 *   devolve a categoria da regra (camada 1 vence a camada 2), como define a spec.
 * - `rule`: cria (ou atualiza, sem duplicar) uma regra aprendida e a aplica nas existentes pelo motor de
 *   categorização, respeitando regras de prioridade maior.
 * Nunca toca em outras transações com categoria do usuário. `updated` = total de transações alteradas.
 */
export async function recategorize(db: Db, input: z.infer<typeof recategorizeInput>) {
  const { transactionId, categoryId, scope } = recategorizeInput.parse(input);

  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          kind: transactions.kind,
          description: transactions.description,
          installmentTotal: transactions.installmentTotal,
          merchantId: transactions.merchantId,
          merchantName: merchants.name,
        })
        // Busca transações similares pelo mesmo estabelecimento para recategorização em lote
    .from(transactions)
        .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
        .where(eq(transactions.id, transactionId));
      if (!current) throw new CommandError('NOT_FOUND', 'Transação não encontrada');

      const [cat] = await tx
        .select({ id: categories.id, kind: categories.kind, archived: categories.archived })
        .from(categories)
        .where(eq(categories.id, categoryId));
      if (!cat) throw new CommandError('NOT_FOUND', 'Categoria não encontrada');
      if (cat.archived) throw new CommandError('VALIDATION', 'A categoria está arquivada');

      // income só em transações income; expense em expense/refund
      if (categoryKindFor(current.kind) !== cat.kind) {
        throw new CommandError('VALIDATION', 'Natureza da categoria incompatível com a transação');
      }

      await tx
        .update(transactions)
        .set({
          categoryId,
          categorySource: 'user',
          categoryConfidence: 1,
          needsReview: false,
          userEditedFields: markEdited(['category']),
        })
        .where(eq(transactions.id, transactionId));
      let updated = 1;
      let ruleId: string | null = null;

      // Memória do estabelecimento (camada 2 da categorização)
      if (current.merchantId) {
        await tx.update(merchants).set({ defaultCategoryId: categoryId }).where(eq(merchants.id, current.merchantId));
      }

      if (scope === 'similar') {
        const ids = await similarTransactionIds(tx, { id: transactionId, ...current }, cat.kind);
        updated += await applyMerchantCategory(tx, ids, categoryId);
      }

      if (scope === 'rule') {
        const rule = await saveLearnedRule(tx, learnedMatchFor(current), categoryId);
        ruleId = rule.id;
        // O motor conta os acertos (hitCount) e respeita a precedência entre regras e a R9
        updated += await applyRuleToExisting(tx, rule);
      }

      return { updated, ruleId };
    });
  } catch (err) {
    throw toCommandError(err);
  }
}

const updateTransactionInput = z.object({
  transactionId: z.string().uuid(),
  patch: z.object({
    description: z.string().min(1).max(200).optional(),
    kind: z.enum(TX_KINDS).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    notes: z.string().max(1000).nullable().optional(),
    tagIds: z.array(z.string().uuid()).optional(),
  }),
});

export async function updateTransaction(db: Db, input: z.infer<typeof updateTransactionInput>) {
  const { transactionId, patch } = updateTransactionInput.parse(input);
  const { tagIds, ...fields } = patch;
  const editedFields = Object.keys(fields);
  try {
    await db.transaction(async (tx) => {
      if (editedFields.length > 0) {
        const res = await tx
          .update(transactions)
          .set({ ...fields, userEditedFields: markEdited(editedFields) })
          .where(eq(transactions.id, transactionId))
          .returning({ id: transactions.id });
        if (res.length === 0) throw new CommandError('NOT_FOUND', 'Transação não encontrada');
      } else {
        // Verifica se a transação existe (consulta interna por ID)
        const [existing] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, transactionId));
        if (!existing) throw new CommandError('NOT_FOUND', 'Transação não encontrada');
      }
      if (tagIds !== undefined) {
        await tx.delete(transactionTags).where(eq(transactionTags.transactionId, transactionId));
        if (tagIds.length > 0) {
          await tx.insert(transactionTags).values(tagIds.map((tagId) => ({ transactionId, tagId })));
        }
      }
    });
  } catch (err) {
    throw toCommandError(err);
  }
}

export async function markReviewed(db: Db, input: { transactionIds: string[] }) {
  const ids = z.array(z.string().uuid()).min(1).parse(input.transactionIds);
  const res = await db
    .update(transactions)
    .set({ needsReview: false })
    .where(and(inArray(transactions.id, ids)))
    .returning({ id: transactions.id });
  return { updated: res.length };
}
