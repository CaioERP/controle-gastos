import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { connections } from '@/server/db/schema';
import type { ConnectionStatus } from '@/server/domain/enums';
import { toCommandError } from '@/server/domain/errors';
import { resolveInstitution } from '@/server/ingestion/institutions';
import { createPluggyAdapter } from '@/server/ingestion/pluggy/adapter';
import type { PluggyApi } from '@/server/ingestion/pluggy/api';
import { getPluggyApi } from '@/server/ingestion/pluggy/client';
import { triggerSync } from './sync';

const registerConnectionInput = z.object({
  provider: z.literal('pluggy'),
  externalId: z.string().trim().min(1),
});

export type RegisterConnectionDeps = {
  pluggy?: PluggyApi;
};

function mapPluggyStatus(status: string): ConnectionStatus {
  switch (status.toUpperCase()) {
    case 'UPDATED':
      return 'active';
    case 'UPDATING':
      return 'syncing';
    case 'LOGIN_ERROR':
    case 'OUTDATED':
    case 'ERROR':
      return 'error';
    case 'WAITING_USER_INPUT':
    default:
      return 'pending';
  }
}

export async function registerConnection(
  db: Db,
  input: z.infer<typeof registerConnectionInput>,
  deps: RegisterConnectionDeps = {},
): Promise<{ connectionId: string }> {
  const data = registerConnectionInput.parse(input);
  const pluggy = deps.pluggy ?? getPluggyApi();

  try {
    const item = await pluggy.fetchItem(data.externalId);
    const status = mapPluggyStatus(item.status);
    const consentExpiresAt = item.consentExpiresAt ? new Date(item.consentExpiresAt) : null;

    let institutionId: string | null = null;
    if (item.connector?.name) {
      const inst = await resolveInstitution(db, item.connector.name, item.connector.id);
      institutionId = inst.id;
    }

    const [existing] = await db
      .select({ id: connections.id })
      .from(connections)
      .where(and(eq(connections.provider, data.provider), eq(connections.externalId, data.externalId)));

    let connectionId: string;
    if (existing) {
      await db
        .update(connections)
        .set({
          status,
          consentExpiresAt,
          institutionId: institutionId ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(connections.id, existing.id));

      connectionId = existing.id;
    } else {
      const [created] = await db
        .insert(connections)
        .values({
          provider: data.provider,
          externalId: data.externalId,
          status,
          consentExpiresAt,
          institutionId,
        })
        .returning({ id: connections.id });

      connectionId = created!.id;
    }

    try {
      await triggerSync(db, { connectionId }, { adapter: createPluggyAdapter(pluggy) });
    } catch {
      // Se a sincronização falhar, o registro da conexão continua válido (o erro fica em sync_runs)
    }

    return { connectionId };
  } catch (err) {
    throw toCommandError(err);
  }
}
