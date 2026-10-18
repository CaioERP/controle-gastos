import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { syncRuns } from '@/server/db/schema';

const triggerSyncInput = z.object({
  connectionId: z.string().uuid().nullable(),
});

/**
 * STUB (F0-03): cria registro de sync_runs concluído com stats de stub.
 */
export async function triggerSync(
  db: Db,
  input: z.infer<typeof triggerSyncInput>,
): Promise<{ syncRunId: string }> {
  const { connectionId } = triggerSyncInput.parse(input);
  const [run] = await db
    .insert(syncRuns)
    .values({
      connectionId,
      job: 'pluggy-sync',
      status: 'success',
      stats: { stub: true },
      finishedAt: new Date(),
    })
    .returning({ id: syncRuns.id });

  return { syncRunId: run!.id };
}
