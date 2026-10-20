import { type NextRequest } from 'next/server';
import { getDb } from '@/server/db/client';
import { listTransactions } from '@/server/queries/transactions';
import { parseFilters } from '@/server/queries/url-filters';
import { CSV_LIMIT_MESSAGE, transactionsToCsv } from '@/server/queries/export-csv';
import type { TransactionRow } from '@/server/queries/transaction-row';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 20_000;
const PAGE_SIZE = 200;

export async function GET(request: NextRequest) {
  const db = getDb();
  const filters = parseFilters(request.nextUrl.searchParams);

  const allRows: TransactionRow[] = [];
  let cursor: string | undefined = undefined;
  let hitCap = false;

  while (true) {
    const page = await listTransactions(db, filters, { limit: PAGE_SIZE, cursor });
    for (const item of page.items) {
      allRows.push(item);
      if (allRows.length >= MAX_ROWS) {
        hitCap = true;
        break;
      }
    }
    if (hitCap || !page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  let csv = transactionsToCsv(allRows);
  if (hitCap) {
    csv += `\r\n;${CSV_LIMIT_MESSAGE};;;;;;;;;;;;;;`;
  }

  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transacoes-${filters.from}-a-${filters.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}