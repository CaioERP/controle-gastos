import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import {
  accounts,
  importBatches,
  transactions,
  transactionSources,
} from '@/server/db/schema';
import type {
  ImportBatchStatus,
  ImportFormat,
  PaymentMethod,
} from '@/server/domain/enums';
import { CommandError, toCommandError } from '@/server/domain/errors';
import {
  findCrossSourceMatches,
  linkSourceToTransaction,
} from '@/server/ingestion/dedupe';
import { detectAndParseFile } from '@/server/ingestion/file/detect';
import { sha256Hex } from '@/server/ingestion/file/hash';
import { upsertTransaction } from '@/server/ingestion/persist';
import { runPipeline } from '@/server/ingestion/pipeline';
import type { NormalizedTransaction } from '@/server/ingestion/types';
import { evaluateSpendingLimitsSafely } from './limits';

export type PreviewItemStatus =
  | 'new'
  | 'exact_duplicate'
  | 'fuzzy_duplicate'
  | 'ambiguous_duplicate';

export type PreviewCandidate = {
  transactionId: string;
  date: string;
  amountCents: number;
  description: string;
  similarity: number;
};

export type PreviewTransactionItem = {
  index: number;
  externalId: string;
  date: string;
  amountCents: number;
  description: string;
  descriptionRaw: string;
  paymentMethod: PaymentMethod;
  installment: { number: number; total: number } | null;
  status: PreviewItemStatus;
  matchedTransactionId: string | null;
  candidates: PreviewCandidate[];
  normalized: NormalizedTransaction;
};

export type ImportBatchPreview = {
  batchId: string;
  accountId: string;
  filename: string;
  format: ImportFormat;
  status: ImportBatchStatus;
  isSynchronizedAccount: boolean;
  invoiceMeta?: {
    closingDate: string | null;
    dueDate: string;
    totalCents: number;
    itemsSumCents: number;
    divergenceCents: number;
  } | null;
  summary: {
    totalItems: number;
    newCount: number;
    exactDuplicateCount: number;
    fuzzyDuplicateCount: number;
    ambiguousCount: number;
  };
  items: PreviewTransactionItem[];
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const previewFileImportInput = z.object({
  accountId: z.string().uuid(),
  filename: z.string().trim().min(1),
  content: z.string().min(1).max(MAX_FILE_SIZE_BYTES),
});

export async function previewFileImport(
  db: Db,
  input: z.infer<typeof previewFileImportInput>,
): Promise<ImportBatchPreview> {
  const data = previewFileImportInput.parse(input);

  try {
    const [account] = await db
      .select({
        id: accounts.id,
        type: accounts.type,
        currency: accounts.currency,
        connectionId: accounts.connectionId,
      })
      .from(accounts)
      .where(eq(accounts.id, data.accountId));

    if (!account) {
      throw new CommandError('NOT_FOUND', 'Conta não encontrada');
    }

    const parsed = detectAndParseFile(
      { filename: data.filename, content: data.content },
      { id: account.id, type: account.type, currency: account.currency },
    );

    const externalIds = parsed.transactions.map((t) => t.externalId);
    const exactExistingMap = new Map<string, string>();

    if (externalIds.length > 0) {
      const existingRows = await db
        .select({
          externalId: transactionSources.externalId,
          transactionId: transactionSources.transactionId,
        })
        .from(transactionSources)
        .innerJoin(transactions, eq(transactions.id, transactionSources.transactionId))
        .where(
          and(
            eq(transactionSources.source, 'file'),
            inArray(transactionSources.externalId, externalIds),
            isNull(transactions.deletedAt),
          ),
        );

      for (const row of existingRows) {
        exactExistingMap.set(row.externalId, row.transactionId);
      }
    }

    const items: PreviewTransactionItem[] = [];
    const matchedInBatch = new Set<string>();
    let newCount = 0;
    let exactDuplicateCount = 0;
    let fuzzyDuplicateCount = 0;
    let ambiguousCount = 0;

    for (let idx = 0; idx < parsed.transactions.length; idx++) {
      const n = parsed.transactions[idx]!;
      const exactTxId = exactExistingMap.get(n.externalId) ?? null;

      let status: PreviewItemStatus;
      let matchedTransactionId: string | null = null;
      let candidates: PreviewCandidate[] = [];

      if (exactTxId) {
        status = 'exact_duplicate';
        matchedTransactionId = exactTxId;
        matchedInBatch.add(exactTxId);
        exactDuplicateCount++;
      } else {
        const crossMatch = await findCrossSourceMatches(
          db,
          account.id,
          {
            source: 'file',
            date: n.date,
            amountCents: n.amountCents,
            description: n.description,
            descriptionRaw: n.descriptionRaw,
          },
          { excludeTransactionIds: matchedInBatch },
        );
        status = crossMatch.status;
        matchedTransactionId = crossMatch.matchedTransactionId;
        candidates = crossMatch.candidates;

        if (status === 'fuzzy_duplicate') {
          if (matchedTransactionId) matchedInBatch.add(matchedTransactionId);
          fuzzyDuplicateCount++;
        } else if (status === 'ambiguous_duplicate') {
          ambiguousCount++;
        } else {
          newCount++;
        }
      }

      items.push({
        index: idx,
        externalId: n.externalId,
        date: n.date,
        amountCents: n.amountCents,
        description: n.description,
        descriptionRaw: n.descriptionRaw,
        paymentMethod: n.paymentMethod,
        installment: n.installment
          ? { number: n.installment.number, total: n.installment.total }
          : null,
        status,
        matchedTransactionId,
        candidates,
        normalized: n,
      });
    }

    const summary = {
      totalItems: items.length,
      newCount,
      exactDuplicateCount,
      fuzzyDuplicateCount,
      ambiguousCount,
    };

    const fileHash = sha256Hex(data.content);

    const [createdBatch] = await db
      .insert(importBatches)
      .values({
        accountId: account.id,
        invoiceId: null,
        filename: data.filename,
        format: parsed.format,
        fileHash,
        status: 'preview',
        previewData: { items, invoiceMeta: null },
        stats: summary,
      })
      .returning({ id: importBatches.id });

    return {
      batchId: createdBatch!.id,
      accountId: account.id,
      filename: data.filename,
      format: parsed.format,
      status: 'preview',
      isSynchronizedAccount: account.connectionId !== null,
      invoiceMeta: null,
      summary,
      items,
    };
  } catch (err) {
    throw toCommandError(err);
  }
}

const confirmDecisionSchema = z.union([
  z.literal('import_as_new'),
  z.literal('skip'),
  z.object({ linkTransactionId: z.string().uuid() }),
]);

const confirmFileImportInput = z.object({
  batchId: z.string().uuid(),
  decisions: z.record(z.string(), confirmDecisionSchema).optional(),
});

type ConfirmFileImportResult = {
  batchId: string;
  created: number;
  linked: number;
  skippedDuplicates: number;
};

export async function confirmFileImport(
  db: Db,
  input: z.infer<typeof confirmFileImportInput>,
): Promise<ConfirmFileImportResult> {
  const data = confirmFileImportInput.parse(input);

  try {
    // Tudo numa transação: se um item falhar, nada fica gravado pela metade (nem o saldo da conta
    // manual fica defasado ao tentar de novo), e duas confirmações simultâneas não duplicam nada.
    const outcome = await db.transaction((tx) => applyFileImport(tx, data));

    if (outcome.pipeline) {
      const { created, linked, skippedDuplicates } = outcome.result;
      await runPipeline({
        db,
        transactionIds: outcome.pipeline.transactionIds,
        accountIds: [outcome.pipeline.accountId],
        connectionId: null,
        stats: { created, linked, skippedDuplicates },
      });
    } else {
      await evaluateSpendingLimitsSafely(db);
    }

    return outcome.result;
  } catch (err) {
    throw toCommandError(err);
  }
}

async function applyFileImport(
  db: Db,
  data: z.infer<typeof confirmFileImportInput>,
): Promise<{
  result: ConfirmFileImportResult;
  pipeline: { transactionIds: string[]; accountId: string } | null;
}> {
  // FOR UPDATE: uma segunda confirmação simultânea espera esta terminar e cai no caminho idempotente
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, data.batchId))
    .for('update');

  if (!batch) {
    throw new CommandError('NOT_FOUND', 'Lote de importação não encontrado');
  }

  if (batch.status === 'confirmed') {
    const existingStats = batch.stats as Record<string, unknown>;
    return {
      result: {
        batchId: batch.id,
        created: Number(existingStats.created ?? 0),
        linked: Number(existingStats.linked ?? 0),
        skippedDuplicates: Number(existingStats.skippedDuplicates ?? 0),
      },
      pipeline: null,
    };
  }

  if (batch.status === 'discarded') {
    throw new CommandError('CONFLICT', 'Este lote de importação já foi descartado');
  }

  const [account] = await db
    .select({
      id: accounts.id,
      type: accounts.type,
      connectionId: accounts.connectionId,
    })
    .from(accounts)
    .where(eq(accounts.id, batch.accountId));

  if (!account) {
    throw new CommandError('NOT_FOUND', 'Conta não encontrada');
  }

  const previewData = batch.previewData as {
    items?: PreviewTransactionItem[];
    invoiceMeta?: ImportBatchPreview['invoiceMeta'];
  };
  const items = previewData.items ?? [];
  const decisions = data.decisions ?? {};

  let created = 0;
  let linked = 0;
  let skippedDuplicates = 0;
  let createdSumCents = 0;
  const createdOrChangedIds: string[] = [];

  for (const item of items) {
    const decision = decisions[String(item.index)];

    if (item.status === 'exact_duplicate') {
      skippedDuplicates++;
      continue;
    }

    if (item.status === 'fuzzy_duplicate') {
      if (decision === 'skip') {
        skippedDuplicates++;
        continue;
      }
      if (decision === 'import_as_new') {
        const res = await upsertTransaction(db, batch.accountId, item.normalized, {
          importBatchId: batch.id,
        });
        if (res.created) {
          created++;
          createdSumCents += item.normalized.amountCents;
        }
        if (res.created || res.changed) {
          createdOrChangedIds.push(res.id);
        }
        continue;
      }
      const targetId =
        typeof decision === 'object' && decision !== null
          ? decision.linkTransactionId
          : item.matchedTransactionId;
      if (targetId) {
        const linkRes = await linkSourceToTransaction(db, {
          transactionId: targetId,
          incoming: item.normalized,
          importBatchId: batch.id,
        });
        if (linkRes.updated) {
          createdOrChangedIds.push(targetId);
        }
        linked++;
      } else {
        skippedDuplicates++;
      }
      continue;
    }

    if (item.status === 'ambiguous_duplicate') {
      if (typeof decision === 'object' && decision !== null) {
        const linkRes = await linkSourceToTransaction(db, {
          transactionId: decision.linkTransactionId,
          incoming: item.normalized,
          importBatchId: batch.id,
        });
        if (linkRes.updated) {
          createdOrChangedIds.push(decision.linkTransactionId);
        }
        linked++;
      } else if (decision === 'import_as_new') {
        const res = await upsertTransaction(db, batch.accountId, item.normalized, {
          importBatchId: batch.id,
        });
        if (res.created) {
          created++;
          createdSumCents += item.normalized.amountCents;
        }
        if (res.created || res.changed) {
          createdOrChangedIds.push(res.id);
        }
      } else {
        skippedDuplicates++;
      }
      continue;
    }

    // item.status === 'new'
    if (decision === 'skip') {
      skippedDuplicates++;
      continue;
    }

    const res = await upsertTransaction(db, batch.accountId, item.normalized, {
      importBatchId: batch.id,
    });
    if (res.created) {
      created++;
      createdSumCents += item.normalized.amountCents;
    } else {
      skippedDuplicates++;
    }
    if (res.created || res.changed) {
      createdOrChangedIds.push(res.id);
    }
  }

  if (account.connectionId === null && account.type !== 'credit_card' && createdSumCents !== 0) {
    await db
      .update(accounts)
      .set({
        balanceCents: sql`${accounts.balanceCents} + ${createdSumCents}`,
        balanceUpdatedAt: new Date(),
      })
      .where(eq(accounts.id, account.id));
  }

  await db
    .update(importBatches)
    .set({
      status: 'confirmed',
      stats: { created, linked, skippedDuplicates },
    })
    .where(eq(importBatches.id, batch.id));

  return {
    result: { batchId: batch.id, created, linked, skippedDuplicates },
    pipeline: { transactionIds: createdOrChangedIds, accountId: batch.accountId },
  };
}

const discardFileImportInput = z.object({
  batchId: z.string().uuid(),
});

export async function discardFileImport(
  db: Db,
  input: z.infer<typeof discardFileImportInput>,
): Promise<void> {
  const data = discardFileImportInput.parse(input);

  try {
    const [batch] = await db
      .select({ id: importBatches.id, status: importBatches.status })
      .from(importBatches)
      .where(eq(importBatches.id, data.batchId));

    if (!batch) {
      throw new CommandError('NOT_FOUND', 'Lote de importação não encontrado');
    }

    if (batch.status === 'confirmed') {
      throw new CommandError('CONFLICT', 'Não é possível descartar um lote já confirmado');
    }

    if (batch.status === 'preview') {
      await db
        .update(importBatches)
        .set({ status: 'discarded' })
        .where(eq(importBatches.id, batch.id));
    }
  } catch (err) {
    throw toCommandError(err);
  }
}
