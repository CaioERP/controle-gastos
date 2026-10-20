import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { categorizeTransactions, categoryKindFor } from '@/server/categorization/engine';
import type { Db } from '@/server/db/client';
import { accounts, categories, institutions, transactions, transactionSources, transactionTags } from '@/server/db/schema';
import { PAYMENT_METHODS, TX_KINDS, type TxKind } from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';

const MANUAL_ACCOUNT_TYPES = ['wallet', 'checking', 'savings', 'benefit', 'investment'] as const;

const createManualAccountInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(MANUAL_ACCOUNT_TYPES),
  institutionId: z.string().uuid().nullable().optional(),
  initialBalanceCents: z.number().int().optional(),
});

export async function createManualAccount(
  db: Db,
  input: z.infer<typeof createManualAccountInput>,
): Promise<{ accountId: string }> {
  const data = createManualAccountInput.parse(input);

  try {
    let institutionId = data.institutionId;
    if (!institutionId) {
      const [defaultInst] = await db
        .select({ id: institutions.id })
        .from(institutions)
        .where(eq(institutions.slug, 'carteira'));
      if (!defaultInst) {
        throw new CommandError('NOT_FOUND', 'Instituição padrão "carteira" não encontrada');
      }
      institutionId = defaultInst.id;
    } else {
      const [inst] = await db
        .select({ id: institutions.id })
        .from(institutions)
        .where(eq(institutions.id, institutionId));
      if (!inst) {
        throw new CommandError('NOT_FOUND', 'Instituição não encontrada');
      }
    }

    const [created] = await db
      .insert(accounts)
      .values({
        institutionId,
        connectionId: null,
        externalId: null,
        type: data.type,
        name: data.name,
        balanceCents: data.initialBalanceCents ?? 0,
        balanceUpdatedAt: data.initialBalanceCents !== undefined ? new Date() : null,
      })
      .returning({ id: accounts.id });

    return { accountId: created!.id };
  } catch (err) {
    throw toCommandError(err);
  }
}

const createManualTransactionInput = z.object({
  accountId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD'),
  amountCents: z.number().int(),
  description: z.string().trim().min(1).max(200),
  kind: z.enum(TX_KINDS),
  paymentMethod: z.enum(PAYMENT_METHODS),
  categoryId: z.string().uuid().nullable(),
  notes: z.string().max(1000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});

function validateAmountSign(kind: TxKind, amountCents: number) {
  if (amountCents === 0) {
    throw new CommandError('VALIDATION', 'Valor não pode ser zero');
  }
  if (kind === 'expense' && amountCents >= 0) {
    throw new CommandError('VALIDATION', 'Despesa deve ter valor negativo');
  }
  if ((kind === 'income' || kind === 'refund') && amountCents <= 0) {
    throw new CommandError('VALIDATION', 'Receita/reembolso deve ter valor positivo');
  }
}

export async function createManualTransaction(
  db: Db,
  input: z.infer<typeof createManualTransactionInput>,
): Promise<{ transactionId: string }> {
  const data = createManualTransactionInput.parse(input);
  validateAmountSign(data.kind, data.amountCents);

  try {
    if (data.categoryId) {
      const [cat] = await db
        .select({ id: categories.id, kind: categories.kind, archived: categories.archived })
        .from(categories)
        .where(eq(categories.id, data.categoryId));
      if (!cat) throw new CommandError('NOT_FOUND', 'Categoria não encontrada');
      if (cat.archived) throw new CommandError('VALIDATION', 'A categoria está arquivada');
      if (categoryKindFor(data.kind) !== cat.kind) {
        throw new CommandError('VALIDATION', 'Natureza da categoria incompatível com a transação');
      }
    }

    const txRow = await db.transaction(async (tx) => {
      const [acc] = await tx
        .select({ id: accounts.id, connectionId: accounts.connectionId })
        .from(accounts)
        .where(eq(accounts.id, data.accountId));
      if (!acc) throw new CommandError('NOT_FOUND', 'Conta não encontrada');
      if (acc.connectionId !== null) {
        throw new CommandError('VALIDATION', 'Transação manual só pode ser lançada em conta manual');
      }

      const [inserted] = await tx
        .insert(transactions)
        .values({
          accountId: data.accountId,
          date: data.date,
          amountCents: data.amountCents,
          currency: 'BRL',
          descriptionRaw: data.description,
          description: data.description,
          merchantId: null,
          kind: data.kind,
          paymentMethod: data.paymentMethod,
          status: 'posted',
          notes: data.notes ?? null,
          categoryId: data.categoryId ?? null,
          categorySource: data.categoryId ? 'user' : 'default',
          categoryConfidence: data.categoryId ? 1 : null,
          needsReview: false,
          userEditedFields: data.categoryId ? ['category'] : [],
        })
        .returning({ id: transactions.id });

      if (data.tagIds && data.tagIds.length > 0) {
        await tx.insert(transactionTags).values(
          data.tagIds.map((tagId) => ({
            transactionId: inserted!.id,
            tagId,
          })),
        );
      }

      await tx.insert(transactionSources).values({
        transactionId: inserted!.id,
        source: 'manual',
        externalId: inserted!.id,
      });

      await tx
        .update(accounts)
        .set({
          balanceCents: sql`${accounts.balanceCents} + ${data.amountCents}`,
          balanceUpdatedAt: new Date(),
        })
        .where(eq(accounts.id, data.accountId));

      return inserted!;
    });

    if (!data.categoryId && categoryKindFor(data.kind) !== null) {
      await categorizeTransactions(db, [txRow.id]);
    }

    return { transactionId: txRow.id };
  } catch (err) {
    throw toCommandError(err);
  }
}

const updateManualTransactionInput = z.object({
  transactionId: z.string().uuid(),
  patch: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD').optional(),
    amountCents: z.number().int().optional(),
  }),
});

export async function updateManualTransaction(
  db: Db,
  input: z.infer<typeof updateManualTransactionInput>,
): Promise<void> {
  const { transactionId, patch } = updateManualTransactionInput.parse(input);
  if (patch.date === undefined && patch.amountCents === undefined) {
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [t] = await tx
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          amountCents: transactions.amountCents,
          kind: transactions.kind,
          parentTransactionId: transactions.parentTransactionId,
          deletedAt: transactions.deletedAt,
        })
        .from(transactions)
        .where(eq(transactions.id, transactionId));

      if (!t || t.deletedAt !== null) {
        throw new CommandError('NOT_FOUND', 'Transação não encontrada');
      }

      if (t.parentTransactionId !== null) {
        throw new CommandError(
          'VALIDATION',
          'Use "Desfazer divisão" para alterar partes de uma transação dividida',
        );
      }

      const [source] = await tx
        .select({ id: transactionSources.id })
        .from(transactionSources)
        .where(
          and(
            eq(transactionSources.transactionId, transactionId),
            eq(transactionSources.source, 'manual'),
          ),
        );

      if (!source) {
        throw new CommandError('VALIDATION', 'Apenas transações manuais podem ter data e valor editados');
      }

      if (patch.amountCents !== undefined) {
        validateAmountSign(t.kind, patch.amountCents);
        const diff = patch.amountCents - t.amountCents;
        if (diff !== 0) {
          await tx
            .update(accounts)
            .set({
              balanceCents: sql`${accounts.balanceCents} + ${diff}`,
              balanceUpdatedAt: new Date(),
            })
            .where(eq(accounts.id, t.accountId));
        }
      }

      const updateFields: { date?: string; amountCents?: number } = {};
      if (patch.date !== undefined) updateFields.date = patch.date;
      if (patch.amountCents !== undefined) updateFields.amountCents = patch.amountCents;

      await tx.update(transactions).set(updateFields).where(eq(transactions.id, transactionId));
    });
  } catch (err) {
    throw toCommandError(err);
  }
}

const deleteManualTransactionInput = z.object({
  transactionId: z.string().uuid(),
});

export async function deleteManualTransaction(
  db: Db,
  input: z.infer<typeof deleteManualTransactionInput>,
): Promise<void> {
  const { transactionId } = deleteManualTransactionInput.parse(input);

  try {
    await db.transaction(async (tx) => {
      const [t] = await tx
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          amountCents: transactions.amountCents,
          parentTransactionId: transactions.parentTransactionId,
          deletedAt: transactions.deletedAt,
        })
        .from(transactions)
        .where(eq(transactions.id, transactionId));

      if (!t || t.deletedAt !== null) {
        throw new CommandError('NOT_FOUND', 'Transação não encontrada');
      }

      if (t.parentTransactionId !== null) {
        throw new CommandError(
          'VALIDATION',
          'Use "Desfazer divisão" para remover partes de uma transação dividida',
        );
      }

      const [source] = await tx
        .select({ id: transactionSources.id })
        .from(transactionSources)
        .where(
          and(
            eq(transactionSources.transactionId, transactionId),
            eq(transactionSources.source, 'manual'),
          ),
        );

      if (!source) {
        throw new CommandError('VALIDATION', 'Apenas transações manuais podem ser excluídas');
      }

      await tx
        .update(transactions)
        .set({ deletedAt: new Date() })
        .where(eq(transactions.id, transactionId));

      await tx
        .update(accounts)
        .set({
          balanceCents: sql`${accounts.balanceCents} - ${t.amountCents}`,
          balanceUpdatedAt: new Date(),
        })
        .where(eq(accounts.id, t.accountId));
    });
  } catch (err) {
    throw toCommandError(err);
  }
}