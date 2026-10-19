import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { invoices, transactions } from '@/server/db/schema';
import type { InvoiceStatus } from '@/server/domain/enums';

export type TransactionInvoice = {
  id: string;
  accountId: string;
  referenceMonth: string;
  dueDate: string;
  status: InvoiceStatus;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fatura da transação (R6), usada no detalhe para o link até /faturas. Null se não for de cartão. */
export async function getTransactionInvoice(db: Db, transactionId: string): Promise<TransactionInvoice | null> {
  if (!UUID.test(transactionId)) return null;
  const [row] = await db
    .select({
      id: invoices.id,
      accountId: invoices.accountId,
      referenceMonth: invoices.referenceMonth,
      dueDate: invoices.dueDate,
      status: invoices.status,
    })
    .from(transactions)
    .innerJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)));
  return row ?? null;
}
