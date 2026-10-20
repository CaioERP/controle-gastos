import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { invoices, transactions } from '@/server/db/schema';
import type { InvoiceStatus } from '@/server/domain/enums';
import { notSplitParent } from './split-filter';
import { baseTransactionQuery, toTransactionRows, type TransactionRow } from './transaction-row';

export type InvoiceSummary = {
  id: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  status: InvoiceStatus;
  paidAt: string | null;
  paidAmountCents: number | null;
  itemCount: number;
  projectedCount: number;
};

export async function getInvoices(db: Db, accountId: string): Promise<InvoiceSummary[]> {
  const invRows = await db
    .select({
      id: invoices.id,
      referenceMonth: invoices.referenceMonth,
      closingDate: invoices.closingDate,
      dueDate: invoices.dueDate,
      totalCents: invoices.totalCents,
      status: invoices.status,
      paidAt: invoices.paidAt,
      paidAmountCents: invoices.paidAmountCents,
      itemCount: sql<number>`count(${transactions.id})`,
      projectedCount: sql<number>`count(case when ${transactions.status} = 'projected' then 1 end)`,
    })
    .from(invoices)
    .leftJoin(
      transactions,
      and(
        eq(transactions.invoiceId, invoices.id),
        ne(transactions.kind, 'invoice_payment'),
        isNull(transactions.deletedAt),
        notSplitParent,
      ),
    )
    .where(eq(invoices.accountId, accountId))
    .groupBy(invoices.id)
    .orderBy(desc(invoices.referenceMonth));

  return invRows.map((r) => ({
    id: r.id,
    referenceMonth: r.referenceMonth,
    closingDate: r.closingDate,
    dueDate: r.dueDate,
    totalCents: Number(r.totalCents ?? 0),
    status: r.status,
    paidAt: r.paidAt,
    paidAmountCents: r.paidAmountCents !== null ? Number(r.paidAmountCents) : null,
    itemCount: Number(r.itemCount ?? 0),
    projectedCount: Number(r.projectedCount ?? 0),
  }));
}

/** Itens da fatura, incluindo parcelas projetadas. O pagamento da fatura (na conta corrente) fica de fora. */
export async function getInvoiceItems(db: Db, invoiceId: string): Promise<TransactionRow[]> {
  const rows = await baseTransactionQuery(db)
    .where(
      and(
        eq(transactions.invoiceId, invoiceId),
        ne(transactions.kind, 'invoice_payment'),
        isNull(transactions.deletedAt),
        notSplitParent,
      ),
    )
    .orderBy(transactions.date, transactions.id);
  return toTransactionRows(db, rows);
}
