import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { accounts } from '@/server/db/schema';
import { CommandError, toCommandError } from '@/server/domain/errors';
import { assignInvoices, recalculateInvoices } from '@/server/ingestion/invoices';

const updateAccountInput = z.object({
  accountId: z.string().uuid(),
  patch: z.object({
    displayName: z.string().max(100).nullable().optional(),
    isHidden: z.boolean().optional(),
    includeInTotals: z.boolean().optional(),
    closingDay: z.number().int().min(1).max(31).nullable().optional(),
    dueDay: z.number().int().min(1).max(31).nullable().optional(),
  }),
});

export async function updateAccount(db: Db, input: z.infer<typeof updateAccountInput>): Promise<void> {
  const { accountId, patch } = updateAccountInput.parse(input);
  try {
    const [before] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!before) throw new CommandError('NOT_FOUND', 'Conta não encontrada');

    const [after] = await db
      .update(accounts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(accounts.id, accountId))
      .returning();

    const cycleChanged =
      (patch.closingDay !== undefined && patch.closingDay !== before.closingDay) ||
      (patch.dueDay !== undefined && patch.dueDay !== before.dueDay);

    if (cycleChanged && after) {
      await assignInvoices(db, [accountId]);
      await recalculateInvoices(db, [accountId]);
    }
  } catch (err) {
    throw toCommandError(err);
  }
}
