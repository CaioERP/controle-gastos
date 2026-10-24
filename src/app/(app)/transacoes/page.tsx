import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { accounts, invoices, transactions } from '@/server/db/schema';
import { today } from '@/server/domain/dates';
import { TX_KINDS } from '@/server/domain/enums';
import { getAccountsOverview } from '@/server/queries/accounts';
import { buildTxWhere } from '@/server/queries/base';
import { listCategories, listTags } from '@/server/queries/catalog';
import { getSpendingSummary } from '@/server/queries/summary';
import { getReviewCount, listTransactions } from '@/server/queries/transactions';
import { parseFilters, serializeFilters } from '@/server/queries/url-filters';
import { PageHeader } from '@/components/layout/page-header';
import { ManualTransactionDialog } from '@/components/manual/manual-transaction-dialog';
import { ExportButton } from '@/components/transactions/export-button';
import { TransactionsFilterBar } from '@/components/transactions/transactions-filter-bar';
import { TransactionList } from '@/components/transactions/transaction-list';
import { TransactionsSummary } from '@/components/transactions/transactions-summary';

export const dynamic = 'force-dynamic';

const FIRST_PAGE = 100;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  // Sem `natureza` na URL, `kinds` vem ausente e a lista mostra todas as naturezas (B1-02);
  // as agregações das outras telas seguem R2. O mesmo objeto vai para o "Carregar mais".
  const filters = parseFilters(await searchParams);
  const db = getDb();
  const [accountsOverview, categories, tags, page, summary, reviewCount, totalCountRow] = await Promise.all([
    getAccountsOverview(db),
    listCategories(db),
    listTags(db),
    listTransactions(db, filters, { limit: FIRST_PAGE }),
    getSpendingSummary(db, filters),
    getReviewCount(db),
    db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
      .where(buildTxWhere(filters, { forTotals: false, defaultKinds: TX_KINDS })),
  ]);

  const totalCount = Number(totalCountRow[0]?.count ?? page.items.length);

  const manualAccounts = accountsOverview.flatMap((inst) =>
    inst.accounts
      .filter((a) => a.connection === null)
      .map((a) => ({
        id: a.id,
        name: a.displayName ?? a.name,
        type: a.type,
        institutionName: inst.institution.name,
        institutionColor: inst.institution.color,
      })),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transações"
        description="Extrato unificado com busca, filtros e edição de categoria."
        actions={
          <div className="flex items-center gap-2">
            <ManualTransactionDialog accounts={manualAccounts} categories={categories} today={today()} />
            <ExportButton filters={filters} />
          </div>
        }
      />
      <TransactionsFilterBar
        accounts={accountsOverview}
        categories={categories}
        tags={tags}
        defaultKinds={TX_KINDS}
      />
      <TransactionsSummary
        expenseCents={summary.expenseCents}
        incomeCents={summary.incomeCents}
        totalCount={totalCount}
        reviewCount={reviewCount}
      />
      {/* Filtros novos recriam a lista (zera páginas extras e o cursor). */}
      <TransactionList
        key={serializeFilters(filters)}
        initialItems={page.items}
        initialCursor={page.nextCursor}
        filters={filters}
        categories={categories}
        tags={tags}
      />
    </div>
  );
}
