import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { categoryKindFor } from '@/server/categorization/engine';
import type { Db } from '@/server/db/client';
import { categories, transactions, transactionSources } from '@/server/db/schema';
import { CommandError, toCommandError } from '@/server/domain/errors';

const splitPartInput = z.object({
  amountCents: z.number().int(),
  categoryId: z.string().uuid().nullable(),
  description: z.string().trim().max(200).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const splitTransactionInput = z.object({
  transactionId: z.string().uuid(),
  parts: z.array(splitPartInput).min(2, 'A divisão deve ter pelo menos duas partes'),
});

export async function splitTransaction(
  db: Db,
  input: z.infer<typeof splitTransactionInput>,
): Promise<{ splitIds: string[] }> {
  const data = splitTransactionInput.parse(input);

  try {
    return await db.transaction(async (tx) => {
      // 1. Carrega a transação original (mãe)
      const [mother] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, data.transactionId), isNull(transactions.deletedAt)));

      if (!mother) {
        throw new CommandError('NOT_FOUND', 'Transação não encontrada');
      }

      if (mother.parentTransactionId !== null) {
        throw new CommandError('VALIDATION', 'Não é possível dividir uma transação que já é resultado de uma divisão');
      }

      // 2. Verifica se a mãe já possui filhas ativas
      const existingChildren = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.parentTransactionId, mother.id), isNull(transactions.deletedAt)));

      if (existingChildren.length > 0) {
        throw new CommandError('VALIDATION', 'Esta transação já foi dividida. Desfaça a divisão anterior para redividir');
      }

      // 3. Validação dos sinais e soma dos centavos das partes
      for (const part of data.parts) {
        if (part.amountCents === 0) {
          throw new CommandError('VALIDATION', 'Nenhuma parte pode ter valor zero');
        }
        if (mother.amountCents < 0 && part.amountCents > 0) {
          throw new CommandError('VALIDATION', 'Todas as partes de uma despesa devem ter valor negativo');
        }
        if (mother.amountCents > 0 && part.amountCents < 0) {
          throw new CommandError('VALIDATION', 'Todas as partes de uma receita devem ter valor positivo');
        }
      }

      const totalPartsCents = data.parts.reduce((sum, p) => sum + p.amountCents, 0);
      if (totalPartsCents !== mother.amountCents) {
        throw new CommandError(
          'VALIDATION',
          'A soma das partes deve ser exatamente igual ao valor da transação original',
        );
      }

      // 4. Validação das categorias das partes
      for (const part of data.parts) {
        if (part.categoryId) {
          const [cat] = await tx
            .select({ id: categories.id, kind: categories.kind, archived: categories.archived })
            .from(categories)
            .where(eq(categories.id, part.categoryId));

          if (!cat) {
            throw new CommandError('NOT_FOUND', 'Categoria não encontrada');
          }
          if (cat.archived) {
            throw new CommandError('VALIDATION', 'A categoria está arquivada');
          }
          if (categoryKindFor(mother.kind) !== cat.kind) {
            throw new CommandError('VALIDATION', 'Natureza da categoria incompatível com a transação');
          }
        }
      }

      // 5. Inserção das filhas
      const splitIds: string[] = [];

      for (const part of data.parts) {
        const desc = part.description && part.description.length > 0 ? part.description : mother.description;

        const [inserted] = await tx
          .insert(transactions)
          .values({
            accountId: mother.accountId,
            cardId: mother.cardId,
            invoiceId: mother.invoiceId,
            date: mother.date,
            amountCents: part.amountCents,
            currency: mother.currency,
            descriptionRaw: mother.descriptionRaw,
            description: desc,
            merchantId: mother.merchantId,
            providerCategoryId: null,
            kind: mother.kind,
            paymentMethod: mother.paymentMethod,
            status: mother.status,
            categoryId: part.categoryId ?? null,
            categorySource: part.categoryId ? 'user' : 'default',
            categoryConfidence: part.categoryId ? 1 : null,
            needsReview: false,
            installmentGroupId: mother.installmentGroupId,
            installmentNumber: mother.installmentNumber,
            installmentTotal: mother.installmentTotal,
            transferGroupId: mother.transferGroupId,
            parentTransactionId: mother.id,
            notes: part.notes !== undefined ? part.notes : mother.notes,
            userEditedFields: part.categoryId ? ['category'] : [],
          })
          .returning({ id: transactions.id });

        splitIds.push(inserted!.id);

        await tx.insert(transactionSources).values({
          transactionId: inserted!.id,
          source: 'manual',
          externalId: inserted!.id,
        });
      }

      return { splitIds };
    });
  } catch (err) {
    throw toCommandError(err);
  }
}

const unsplitTransactionInput = z.object({
  transactionId: z.string().uuid(),
});

export async function unsplitTransaction(
  db: Db,
  input: z.infer<typeof unsplitTransactionInput>,
): Promise<void> {
  const { transactionId } = unsplitTransactionInput.parse(input);

  try {
    await db.transaction(async (tx) => {
      const [t] = await tx
        .select({
          id: transactions.id,
          parentTransactionId: transactions.parentTransactionId,
          deletedAt: transactions.deletedAt,
        })
        .from(transactions)
        .where(eq(transactions.id, transactionId));

      if (!t || t.deletedAt !== null) {
        throw new CommandError('NOT_FOUND', 'Transação não encontrada');
      }

      // Se for filha, encontramos o ID da mãe; se for mãe, usamos o ID dela
      const motherId = t.parentTransactionId ?? t.id;

      // Confere se há filhas ativas ligadas à mãe
      const activeChildren = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.parentTransactionId, motherId), isNull(transactions.deletedAt)));

      if (activeChildren.length === 0) {
        throw new CommandError('VALIDATION', 'Esta transação não possui divisões ativas para desfazer');
      }

      // Soft delete em todas as filhas ativas
      await tx
        .update(transactions)
        .set({ deletedAt: new Date() })
        .where(and(eq(transactions.parentTransactionId, motherId), isNull(transactions.deletedAt)));
    });
  } catch (err) {
    throw toCommandError(err);
  }
}
