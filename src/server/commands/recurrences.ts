import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import {
  accounts,
  categories,
  merchants,
  recurrences,
} from '@/server/db/schema';
import {
  PAYMENT_METHODS,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_STATUSES,
} from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';
import { today as getToday } from '@/server/domain/dates';
import {
  runRecurrenceDetection,
  type DetectionResult,
} from '@/server/recurrences/detector';

export const upsertRecurrenceInput = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1, 'Descrição é obrigatória').max(200),
  merchantId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  frequency: z.enum(RECURRENCE_FREQUENCIES).optional().default('monthly'),
  expectedDay: z.number().int().min(1).max(31).nullable().optional(),
  amountCents: z.number().int(),
  tolerancePercent: z.number().int().min(0).max(100).optional().default(10),
  status: z.enum(RECURRENCE_STATUSES).optional().default('active'),
  isSubscription: z.boolean().optional().default(false),
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lastDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lastAmountCents: z.number().int().optional(),
  autoDetected: z.boolean().optional().default(false),
});

export type UpsertRecurrenceInput = z.input<typeof upsertRecurrenceInput>;

export async function upsertRecurrence(
  db: Db,
  input: UpsertRecurrenceInput,
): Promise<{ recurrenceId: string }> {
  try {
    const data = upsertRecurrenceInput.parse(input);

    if (data.amountCents <= 0) {
      throw new CommandError('VALIDATION', 'O valor deve ser maior que zero');
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

    if (data.merchantId) {
      const [merch] = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.id, data.merchantId));
      if (!merch) throw new CommandError('NOT_FOUND', 'Estabelecimento não encontrado');
    }

    const todayDate = getToday();
    const firstDate = data.firstDate ?? todayDate;
    const lastDate = data.lastDate ?? todayDate;
    const lastAmountCents = data.lastAmountCents ?? data.amountCents;

    if (data.id) {
      const [existing] = await db
        .select({ id: recurrences.id })
        .from(recurrences)
        .where(eq(recurrences.id, data.id));
      if (!existing) throw new CommandError('NOT_FOUND', 'Recorrência não encontrada');

      const [updated] = await db
        .update(recurrences)
        .set({
          description: data.description,
          merchantId: data.merchantId ?? null,
          categoryId: data.categoryId ?? null,
          accountId: data.accountId ?? null,
          paymentMethod: data.paymentMethod ?? null,
          frequency: data.frequency,
          expectedDay: data.expectedDay ?? null,
          amountCents: data.amountCents,
          tolerancePercent: data.tolerancePercent,
          status: data.status,
          isSubscription: data.isSubscription,
          firstDate,
          lastDate,
          lastAmountCents,
          autoDetected: data.autoDetected,
          updatedAt: new Date(),
        })
        .where(eq(recurrences.id, data.id))
        .returning({ id: recurrences.id });

      return { recurrenceId: updated!.id };
    }

    const [created] = await db
      .insert(recurrences)
      .values({
        description: data.description,
        merchantId: data.merchantId ?? null,
        categoryId: data.categoryId ?? null,
        accountId: data.accountId ?? null,
        paymentMethod: data.paymentMethod ?? null,
        frequency: data.frequency,
        expectedDay: data.expectedDay ?? null,
        amountCents: data.amountCents,
        tolerancePercent: data.tolerancePercent,
        status: data.status,
        isSubscription: data.isSubscription,
        firstDate,
        lastDate,
        lastAmountCents,
        autoDetected: data.autoDetected,
      })
      .returning({ id: recurrences.id });

    return { recurrenceId: created!.id };
  } catch (err) {
    throw toCommandError(err);
  }
}

export const deleteRecurrenceInput = z.object({
  recurrenceId: z.string().uuid(),
});

export type DeleteRecurrenceInput = z.input<typeof deleteRecurrenceInput>;

export async function deleteRecurrence(
  db: Db,
  input: DeleteRecurrenceInput,
): Promise<void> {
  try {
    const data = deleteRecurrenceInput.parse(input);

    const [existing] = await db
      .select({ id: recurrences.id })
      .from(recurrences)
      .where(eq(recurrences.id, data.recurrenceId));
    if (!existing) throw new CommandError('NOT_FOUND', 'Recorrência não encontrada');

    await db.delete(recurrences).where(eq(recurrences.id, data.recurrenceId));
  } catch (err) {
    throw toCommandError(err);
  }
}

export async function detectRecurrences(
  db: Db,
  opts?: { today?: string },
): Promise<DetectionResult> {
  return runRecurrenceDetection(db, opts);
}
