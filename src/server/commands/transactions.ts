import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { categoryKindFor, notUserCategorized } from '@/server/categorization/engine';
import { ruleMatches } from '@/server/categorization/rules';
import type { Db } from '@/server/db/client';
import { categories, categorizationRules, merchants, transactions, transactionTags } from '@/server/db/schema';
import {
  PAYMENT_METHODS,
  TX_KINDS,
  type CategoryKind,
  type CategorySource,
  type TxKind,
} from '@/server/domain/enums';
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

/**
 * Descrição sem o sufixo de parcela no final (" 3/10", " PARC 03/10", " - Parcela 3 de 10").
 * "Notebook Dell 3/10" → "Notebook Dell". Usada para achar transações parecidas e como padrão de regra aprendida.
 */
export function descriptionBase(description: string): string {
  const base = description.replace(/\s*-?\s*(?:parc(?:ela)?\.?\s*)?\d{1,2}\s*(?:\/|de)\s*\d{1,2}\s*$/i, '').trim();
  return base || description.trim();
}

type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Transações que podem receber categoria automaticamente: não excluídas, de natureza compatível com a categoria,
 * sem categoria do usuário (R9) e diferentes da transação de origem. `merchantId` (se informado) restringe ao
 * mesmo estabelecimento (`null` = sem estabelecimento).
 */
async function automationCandidates(
  tx: DbTx,
  opts: { excludeId: string; categoryKind: CategoryKind; merchantId?: string | null },
) {
  const kinds: TxKind[] = opts.categoryKind === 'income' ? ['income'] : ['expense', 'refund'];
  const sameMerchant =
    opts.merchantId === undefined
      ? undefined
      : opts.merchantId === null
        ? isNull(transactions.merchantId)
        : eq(transactions.merchantId, opts.merchantId);
  return tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      amountCents: transactions.amountCents,
      description: transactions.description,
      descriptionRaw: transactions.descriptionRaw,
      merchantName: merchants.name,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(
      and(
        ne(transactions.id, opts.excludeId),
        isNull(transactions.deletedAt),
        inArray(transactions.kind, kinds),
        notUserCategorized(),
        sameMerchant,
      ),
    );
}

/** Grava a categoria automática nos ids, com a guarda de R9 no `WHERE`. Não regrava (nem conta) as que já estão iguais. */
async function applyAutomaticCategory(
  tx: DbTx,
  ids: string[],
  categoryId: string,
  source: Extract<CategorySource, 'merchant' | 'rule'>,
): Promise<number> {
  if (ids.length === 0) return 0;
  const res = await tx
    .update(transactions)
    .set({
      categoryId,
      categorySource: source,
      categoryConfidence: source === 'rule' ? 1 : 0.95,
      needsReview: false,
    })
    .where(
      and(
        inArray(transactions.id, ids),
        notUserCategorized(),
        or(
          isNull(transactions.categoryId),
          ne(transactions.categoryId, categoryId),
          ne(transactions.categorySource, source),
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
 *   que recebem `categorySource: 'merchant'`.
 * - `rule`: cria uma regra aprendida e aplica nas existentes que casam, com `categorySource: 'rule'`.
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
          merchantId: transactions.merchantId,
          merchantName: merchants.name,
        })
        .from(transactions)
        .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
        .where(eq(transactions.id, transactionId));
      if (!current) throw new CommandError('NOT_FOUND', 'Transação não encontrada');

      const [cat] = await tx
        .select({ id: categories.id, kind: categories.kind })
        .from(categories)
        .where(eq(categories.id, categoryId));
      if (!cat) throw new CommandError('NOT_FOUND', 'Categoria não encontrada');

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
        const candidates = await automationCandidates(tx, {
          excludeId: transactionId,
          categoryKind: cat.kind,
          merchantId: current.merchantId,
        });
        const base = normalizeForMatch(descriptionBase(current.description));
        const ids = candidates
          .filter((c) => current.merchantId !== null || normalizeForMatch(descriptionBase(c.description)) === base)
          .map((c) => c.id);
        updated += await applyAutomaticCategory(tx, ids, categoryId, 'merchant');
      }

      if (scope === 'rule') {
        const byMerchant = current.merchantName !== null;
        const [rule] = await tx
          .insert(categorizationRules)
          .values({
            matchField: byMerchant ? 'merchant' : 'description',
            matchType: byMerchant ? 'equals' : 'contains',
            pattern: current.merchantName ?? descriptionBase(current.description),
            setCategoryId: categoryId,
            origin: 'learned',
          })
          .returning();
        ruleId = rule!.id;
        const candidates = await automationCandidates(tx, { excludeId: transactionId, categoryKind: cat.kind });
        const ids = candidates.filter((c) => ruleMatches(rule!, c)).map((c) => c.id);
        const applied = await applyAutomaticCategory(tx, ids, categoryId, 'rule');
        if (applied > 0) {
          await tx.update(categorizationRules).set({ hitCount: applied }).where(eq(categorizationRules.id, ruleId));
        }
        updated += applied;
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
        // Verifica se a transação existe
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
