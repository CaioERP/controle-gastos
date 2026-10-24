import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { syncRuns } from '../db/schema';
import { seedBase } from '../db/seed';
import { getAttentionItems } from './attention';

describe('getAttentionItems - job errors (A6-10)', () => {
  it('mostra erro de job recente e remove quando sucede', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // 1. Job falhou há 1 hora
    await db.insert(syncRuns).values({
      job: 'sync-all',
      status: 'error',
      startedAt: new Date(oneHourAgo.getTime() - 10000),
      finishedAt: oneHourAgo,
      error: 'Timeout ao conectar na API',
    });

    const itemsWithError = await getAttentionItems(db, { now });
    const jobErrorItem = itemsWithError.find(
      (item) => item.kind === 'job_error' && item.job === 'sync-all',
    );
    expect(jobErrorItem).toBeDefined();
    expect(jobErrorItem).toMatchObject({
      kind: 'job_error',
      job: 'sync-all',
      failedAt: oneHourAgo.toISOString(),
      href: '/conexoes',
    });

    // 2. Job roda de novo com sucesso
    const successTime = new Date(now.getTime() - 5 * 60 * 1000);
    await db.insert(syncRuns).values({
      job: 'sync-all',
      status: 'success',
      startedAt: new Date(successTime.getTime() - 10000),
      finishedAt: successTime,
      stats: { synced: 1 },
    });

    const itemsAfterSuccess = await getAttentionItems(db, { now });
    const clearedItem = itemsAfterSuccess.find(
      (item) => item.kind === 'job_error' && item.job === 'sync-all',
    );
    expect(clearedItem).toBeUndefined();

    // 3. Job com erro antigo (> 48h) não aparece
    const fiftyHoursAgo = new Date(now.getTime() - 50 * 60 * 60 * 1000);
    await db.insert(syncRuns).values({
      job: 'prices-daily',
      status: 'error',
      startedAt: new Date(fiftyHoursAgo.getTime() - 10000),
      finishedAt: fiftyHoursAgo,
      error: 'Erro de cotação antiga',
    });

    const itemsAfterOldError = await getAttentionItems(db, { now });
    const oldErrorItem = itemsAfterOldError.find(
      (item) => item.kind === 'job_error' && item.job === 'prices-daily',
    );
    expect(oldErrorItem).toBeUndefined();
  });
});
