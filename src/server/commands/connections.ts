import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { connections } from '@/server/db/schema';
import { CommandError, toCommandError } from '@/server/domain/errors';

const registerConnectionInput = z.object({
  provider: z.literal('pluggy'),
  externalId: z.string().min(1),
});

const reconnectConnectionInput = z.object({
  connectionId: z.string().uuid(),
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

/**
 * STUB (A2-05 / B2-02): reativa a conexão e limpa o último erro.
 */
export async function reconnectConnection(
  db: Db,
  input: z.infer<typeof reconnectConnectionInput>,
): Promise<{ connectionId: string; syncRunId: string | null }> {
  try {
    const data = reconnectConnectionInput.parse(input);
    const updated = await db
      .update(connections)
      .set({
        status: 'active',
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(connections.id, data.connectionId))
      .returning({ id: connections.id });

    if (updated.length === 0) {
      throw new CommandError('NOT_FOUND', 'Conexão não encontrada');
    }

    return { connectionId: data.connectionId, syncRunId: null };
  } catch (err) {
    throw toCommandError(err);
  }
}
