import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { accounts, importBatches } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getPendingImportPreview, listImportBatches } from './imports';

describe('queries / imports', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: '2026-10-15', months: 6, seed: 42 });
  });

  it('listImportBatches e getPendingImportPreview retornam os lotes e reconstroem o preview', async () => {
    const [acc] = await db.select().from(accounts).limit(1);

    const [batch] = await db
      .insert(importBatches)
      .values({
        accountId: acc!.id,
        filename: 'extrato-teste.csv',
        format: 'csv_nubank_checking',
        fileHash: 'abc123456',
        status: 'preview',
        previewData: {
          items: [
            {
              index: 0,
              externalId: 'file:123',
              date: '2026-10-10',
              amountCents: -4590,
              description: 'Uber Do Brasil',
              descriptionRaw: 'UBER DO BRASIL',
              paymentMethod: 'pix',
              installment: null,
              status: 'new',
              matchedTransactionId: null,
              candidates: [],
              normalized: {
                source: 'file',
                externalId: 'file:123',
                accountExternalId: acc!.id,
                date: '2026-10-10',
                amountCents: -4590,
                currency: 'BRL',
                descriptionRaw: 'UBER DO BRASIL',
                description: 'Uber Do Brasil',
                merchantName: 'Uber',
                paymentMethod: 'pix',
                status: 'posted',
                cardLast4: null,
                invoiceExternalId: null,
                providerCategoryId: null,
                installment: null,
                raw: {},
              },
            },
          ],
          invoiceMeta: null,
        },
        stats: {
          totalItems: 1,
          newCount: 1,
          exactDuplicateCount: 0,
          fuzzyDuplicateCount: 0,
          ambiguousCount: 0,
        },
      })
      .returning();

    const list = await listImportBatches(db);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const found = list.find((r) => r.id === batch!.id);
    expect(found).toBeDefined();
    expect(found!.filename).toBe('extrato-teste.csv');
    expect(found!.status).toBe('preview');
    expect(found!.stats.newCount).toBe(1);

    const preview = await getPendingImportPreview(db, batch!.id);
    expect(preview).not.toBeNull();
    expect(preview!.batchId).toBe(batch!.id);
    expect(preview!.summary.newCount).toBe(1);
    expect(preview!.items).toHaveLength(1);
    expect(preview!.items[0]!.description).toBe('Uber Do Brasil');

    expect(await getPendingImportPreview(db, 'id-invalido')).toBeNull();
  });
});
