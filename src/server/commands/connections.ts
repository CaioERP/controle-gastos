import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { connections } from '@/server/db/schema';

const registerConnectionInput = z.object({
  provider: z.literal('pluggy'),
  externalId: z.string().min(1),
});

/**
 * STUB (F0-03): insere ou busca conexão com status pending.
 */
export async function registerConnection(
  db: Db,
  input: z.infer<typeof registerConnectionInput>,
): Promise<{ connectionId: string }> {
  const data = registerConnectionInput.parse(input);

  const [existing] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.provider, data.provider), eq(connections.externalId, data.externalId)));

  if (existing) {
    return { connectionId: existing.id };
  }

  const [created] = await db
    .insert(connections)
    .values({
      provider: data.provider,
      externalId: data.externalId,
      status: 'pending',
    })
    .onConflictDoNothing()
    .returning({ id: connections.id });

  if (created) return { connectionId: created.id };

  const [retry] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.provider, data.provider), eq(connections.externalId, data.externalId)));
  return { connectionId: retry!.id };
}
