import { getDb } from '@/server/db/client';
import { getAccountsOverview } from '@/server/queries/accounts';
import { getPendingImportPreview, listImportBatches } from '@/server/queries/imports';
import { PageHeader } from '@/components/layout/page-header';
import { ImportDropzone, type ImportAccountOption } from '@/components/imports/import-dropzone';
import { ImportHistoryTable } from '@/components/imports/import-history-table';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ImportarPage({ searchParams }: Props) {
  const sp = await searchParams;
  const defaultAccountId = typeof sp.conta === 'string' ? sp.conta : undefined;
  const batchId = typeof sp.lote === 'string' ? sp.lote : undefined;

  const db = getDb();
  const [overview, batches, initialPreview] = await Promise.all([
    getAccountsOverview(db),
    listImportBatches(db, { limit: 20 }),
    batchId ? getPendingImportPreview(db, batchId) : Promise.resolve(null),
  ]);

  const accounts: ImportAccountOption[] = overview.flatMap((inst) =>
    inst.accounts
      .filter((a) => !a.isHidden)
      .map((a) => ({
        id: a.id,
        name: a.displayName ?? a.name,
        type: a.type,
        institutionName: inst.institution.name,
        institutionColor: inst.institution.color,
        isSynchronized: a.connection !== null,
      })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar arquivos"
        description="Importe extratos OFX ou CSV (Nubank) com detecção de duplicatas."
      />

      <ImportDropzone
        key={initialPreview?.batchId ?? 'new'}
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        initialPreview={initialPreview}
      />

      <ImportHistoryTable batches={batches} />
    </div>
  );
}
