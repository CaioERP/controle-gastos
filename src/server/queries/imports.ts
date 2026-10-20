import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, importBatches, institutions } from '@/server/db/schema';
import type { ImportBatchStatus, ImportFormat } from '@/server/domain/enums';
import type { ImportBatchPreview, PreviewTransactionItem } from '@/server/commands/imports';

export type ImportBatchRow = {
  id: string;
  accountId: string;
  accountName: string;
  institutionName: string;
  institutionColor: string;
  filename: string;
  format: string;
  status: ImportBatchStatus;
  stats: {
    totalItems?: number;
    created?: number;
    linked?: number;
    skippedDuplicates?: number;
    newCount?: number;
    divergenceCents?: number;
  };
  createdAt: Date;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listImportBatches(
  db: Db,
  opts?: { limit?: number },
): Promise<ImportBatchRow[]> {
  const limit = Math.min(Math.max(1, opts?.limit ?? 20), 100);

  const rows = await db
    .select({
      id: importBatches.id,
      accountId: importBatches.accountId,
      accountName: accounts.name,
      accountDisplayName: accounts.displayName,
      institutionName: institutions.name,
      institutionColor: institutions.color,
      filename: importBatches.filename,
      format: importBatches.format,
      status: importBatches.status,
      stats: importBatches.stats,
      createdAt: importBatches.createdAt,
    })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .innerJoin(institutions, eq(institutions.id, accounts.institutionId))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: r.accountDisplayName ?? r.accountName,
    institutionName: r.institutionName,
    institutionColor: r.institutionColor,
    filename: r.filename,
    format: r.format,
    status: r.status,
    stats: (r.stats ?? {}) as ImportBatchRow['stats'],
    createdAt: r.createdAt,
  }));
}

export async function getPendingImportPreview(
  db: Db,
  batchId: string,
): Promise<ImportBatchPreview | null> {
  if (!UUID_RE.test(batchId)) {
    return null;
  }

  const [row] = await db
    .select({
      id: importBatches.id,
      accountId: importBatches.accountId,
      filename: importBatches.filename,
      format: importBatches.format,
      status: importBatches.status,
      previewData: importBatches.previewData,
      stats: importBatches.stats,
      connectionId: accounts.connectionId,
    })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .where(and(eq(importBatches.id, batchId), eq(importBatches.status, 'preview')));

  if (!row) {
    return null;
  }

  const pd = (row.previewData ?? {}) as {
    items?: PreviewTransactionItem[];
    invoiceMeta?: ImportBatchPreview['invoiceMeta'];
  };
  const items = Array.isArray(pd.items) ? pd.items : [];
  const st = (row.stats ?? {}) as Partial<ImportBatchPreview['summary']>;

  const summary: ImportBatchPreview['summary'] = {
    totalItems: st.totalItems ?? items.length,
    newCount: st.newCount ?? items.filter((i) => i.status === 'new').length,
    exactDuplicateCount:
      st.exactDuplicateCount ?? items.filter((i) => i.status === 'exact_duplicate').length,
    fuzzyDuplicateCount:
      st.fuzzyDuplicateCount ?? items.filter((i) => i.status === 'fuzzy_duplicate').length,
    ambiguousCount:
      st.ambiguousCount ?? items.filter((i) => i.status === 'ambiguous_duplicate').length,
  };

  return {
    batchId: row.id,
    accountId: row.accountId,
    filename: row.filename,
    format: row.format as ImportFormat,
    status: row.status,
    isSynchronizedAccount: row.connectionId !== null,
    invoiceMeta: pd.invoiceMeta ?? null,
    summary,
    items,
  };
}
