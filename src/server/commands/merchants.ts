import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { merchants } from '@/server/db/schema';
import { CommandError, toCommandError } from '@/server/domain/errors';

const updateMerchantInput = z.object({
  merchantId: z.string().uuid(),
  patch: z.object({
    name: z.string().min(1).max(100).optional(),
    defaultCategoryId: z.string().uuid().nullable().optional(),
  }),
});

export async function updateMerchant(
  db: Db,
  input: z.infer<typeof updateMerchantInput>,
): Promise<void> {
  const { merchantId, patch } = updateMerchantInput.parse(input);

  if (patch.name !== undefined) {
    const [conflict] = await db
      .select({ id: merchants.id })
      .from(merchants)
      .where(and(eq(merchants.name, patch.name), ne(merchants.id, merchantId)));
    if (conflict) {
      throw new CommandError('CONFLICT', `Estabelecimento "${patch.name}" já existe`);
    }
  }

  try {
    const res = await db
      .update(merchants)
      .set(patch)
      .where(eq(merchants.id, merchantId))
      .returning({ id: merchants.id });
    if (res.length === 0) throw new CommandError('NOT_FOUND', 'Estabelecimento não encontrado');
  } catch (err) {
    throw toCommandError(err);
  }
}
