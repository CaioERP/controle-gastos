import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { connections } from '@/server/db/schema';
import type { ConnectionStatus } from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';
import { resolveInstitution } from '@/server/ingestion/institutions';
import { createPluggyAdapter } from '@/server/ingestion/pluggy/adapter';
import type { PluggyApi } from '@/server/ingestion/pluggy/api';
import { getPluggyApi } from '@/server/ingestion/pluggy/client';
import { triggerSync } from './sync';

const registerConnectionInput = z.object({
  provider: z.literal('pluggy'),
  externalId: z.string().trim().min(1),
});

const reconnectConnectionInput = z.object({
  connectionId: z.string().uuid(),
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

export async function reconnectConnection(
  db: Db,
  input: z.infer<typeof reconnectConnectionInput>,
  deps: RegisterConnectionDeps & { triggerSyncFn?: typeof triggerSync } = {},
): Promise<{ connectionId: string; syncRunId: string | null }> {
  const data = reconnectConnectionInput.parse(input);
  const pluggy = deps.pluggy ?? getPluggyApi();
  const triggerSyncFn = deps.triggerSyncFn ?? triggerSync;

  try {
    const [conn] = await db
      .select({ id: connections.id, externalId: connections.externalId })
      .from(connections)
      .where(eq(connections.id, data.connectionId));

    if (!conn) {
      throw new CommandError('NOT_FOUND', 'Conexão não encontrada');
    }

    const item = await pluggy.fetchItem(conn.externalId);
    const status = mapPluggyStatus(item.status);
    const consentExpiresAt = item.consentExpiresAt ? new Date(item.consentExpiresAt) : null;

    await db
      .update(connections)
      .set({
        status,
        consentExpiresAt,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(connections.id, conn.id));

    let syncRunId: string | null = null;
    try {
      const res = await triggerSyncFn(
        db,
        { connectionId: conn.id },
        { adapter: createPluggyAdapter(pluggy) },
      );
      syncRunId = res.syncRunId;
    } catch {
      syncRunId = null;
    }

    return { connectionId: conn.id, syncRunId };
  } catch (err) {
    throw toCommandError(err);
  }
}
