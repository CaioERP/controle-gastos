import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { accounts } from '@/server/db/schema';
import { CommandError } from '@/server/domain/errors';

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
  const res = await db.update(accounts).set(patch).where(eq(accounts.id, accountId)).returning({ id: accounts.id });
  if (res.length === 0) throw new CommandError('NOT_FOUND', 'Conta não encontrada');
}
