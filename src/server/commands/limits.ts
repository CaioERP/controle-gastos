import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { accounts, categories, spendingLimits } from '@/server/db/schema';
import { LIMIT_PERIODS, PAYMENT_METHODS } from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';
import { evaluateLimitsEngine, evaluateSystemAlerts } from '@/server/limits/engine';
import { logServerError } from '@/server/log';

export const upsertSpendingLimitInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Nome é obrigatório').max(100),
  categoryId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  period: z.enum(LIMIT_PERIODS).optional().default('monthly'),
  amountCents: z.number().int(),
  thresholds: z.array(z.number().int().min(1).max(200)).optional().default([80, 100]),
  notifyPace: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
});

export type UpsertSpendingLimitInput = z.input<typeof upsertSpendingLimitInput>;

export async function upsertSpendingLimit(
  db: Db,
  input: UpsertSpendingLimitInput,
): Promise<{ limitId: string }> {
  try {
    const data = upsertSpendingLimitInput.parse(input);

    if (data.amountCents <= 0) {
      throw new CommandError('VALIDATION', 'O valor limite deve ser maior que zero');
    }

    if (data.categoryId) {
      const [cat] = await db
        .select({ id: categories.id, archived: categories.archived })
        .from(categories)
        .where(eq(categories.id, data.categoryId));
      if (!cat) throw new CommandError('NOT_FOUND', 'Categoria não encontrada');
      if (cat.archived) throw new CommandError('VALIDATION', 'Categoria está arquivada');
    }

    if (data.accountId) {
      const [acc] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, data.accountId));
      if (!acc) throw new CommandError('NOT_FOUND', 'Conta não encontrada');
    }

    if (data.id) {
      const [existing] = await db
        .select({ id: spendingLimits.id })
        .from(spendingLimits)
        .where(eq(spendingLimits.id, data.id));
      if (!existing) throw new CommandError('NOT_FOUND', 'Limite de gastos não encontrado');

      const [updated] = await db
        .update(spendingLimits)
        .set({
          name: data.name,
          categoryId: data.categoryId ?? null,
          paymentMethod: data.paymentMethod ?? null,
          accountId: data.accountId ?? null,
          period: data.period,
          amountCents: data.amountCents,
          thresholds: data.thresholds,
          notifyPace: data.notifyPace,
          isActive: data.isActive,
          updatedAt: new Date(),
        })
        .where(eq(spendingLimits.id, data.id))
        .returning({ id: spendingLimits.id });

      return { limitId: updated!.id };
    }

    const [created] = await db
      .insert(spendingLimits)
      .values({
        name: data.name,
        categoryId: data.categoryId ?? null,
        paymentMethod: data.paymentMethod ?? null,
        accountId: data.accountId ?? null,
        period: data.period,
        amountCents: data.amountCents,
        thresholds: data.thresholds,
        notifyPace: data.notifyPace,
        isActive: data.isActive,
      })
      .returning({ id: spendingLimits.id });

    return { limitId: created!.id };
  } catch (err) {
    throw toCommandError(err);
  }
}

export const deleteSpendingLimitInput = z.object({
  limitId: z.string().uuid(),
});

export const setSpendingLimitActiveInput = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type SetSpendingLimitActiveInput = z.infer<typeof setSpendingLimitActiveInput>;

export async function setSpendingLimitActive(
  db: Db,
  input: SetSpendingLimitActiveInput,
): Promise<void> {
  try {
    const data = setSpendingLimitActiveInput.parse(input);

    const updated = await db
      .update(spendingLimits)
      .set({
        isActive: data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(spendingLimits.id, data.id))
      .returning({ id: spendingLimits.id });

    if (updated.length === 0) {
      throw new CommandError('NOT_FOUND', 'Limite de gastos não encontrado');
    }
  } catch (err) {
    throw toCommandError(err);
  }
}

export async function deleteSpendingLimit(
  db: Db,
  input: z.infer<typeof deleteSpendingLimitInput>,
): Promise<void> {
  try {
    const data = deleteSpendingLimitInput.parse(input);

    const [existing] = await db
      .select({ id: spendingLimits.id })
      .from(spendingLimits)
      .where(eq(spendingLimits.id, data.limitId));
    if (!existing) throw new CommandError('NOT_FOUND', 'Limite de gastos não encontrado');

    await db.delete(spendingLimits).where(eq(spendingLimits.id, data.limitId));
  } catch (err) {
    throw toCommandError(err);
  }
}

/**
 * Avaliação completa de limites e alertas de sistema.
 */
export async function evaluateSpendingLimits(
  db: Db,
  opts?: { transactionIds?: string[]; today?: string },
): Promise<{ evaluatedLimits: number; newNotifications: number }> {
  try {
    const limitsResult = await evaluateLimitsEngine(db, { today: opts?.today });
    const systemNotifs = await evaluateSystemAlerts(db, opts);

    return {
      evaluatedLimits: limitsResult.evaluatedLimits,
      newNotifications: limitsResult.newNotifications + systemNotifs,
    };
  } catch (err) {
    throw toCommandError(err);
  }
}

/**
 * Avaliação depois de gravar transações (lançamento manual, importação). A gravação já foi
 * confirmada: uma falha aqui só vira log, senão o usuário vê erro e repete o lançamento em dobro.
 */
export async function evaluateSpendingLimitsSafely(
  db: Db,
  opts?: { transactionIds?: string[]; today?: string },
): Promise<void> {
  try {
    await evaluateSpendingLimits(db, opts);
  } catch (err) {
    logServerError('limits', err, { action: 'avaliação de limites e alertas' });
  }
}
