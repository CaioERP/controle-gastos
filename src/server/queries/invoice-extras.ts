import { and, asc, eq, isNull, lt, ne } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { invoices, transactions } from '@/server/db/schema';

export type InvoiceExtras = {
  minimumPaymentCents: number | null;
  /** Pagamento da fatura (R6): campos da própria fatura ou, na falta, os `invoice_payment` vinculados a ela. */
  payment: { date: string; amountCents: number } | null;
};

/** Dados complementares do detalhe da fatura que `getInvoices` não traz. */
export async function getInvoiceExtras(db: Db, invoiceId: string): Promise<InvoiceExtras | null> {
  const [inv] = await db
    .select({
      accountId: invoices.accountId,
      minimumPaymentCents: invoices.minimumPaymentCents,
      paidAt: invoices.paidAt,
      paidAmountCents: invoices.paidAmountCents,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));
  if (!inv) return null;

  const minimumPaymentCents = inv.minimumPaymentCents !== null ? Number(inv.minimumPaymentCents) : null;

  if (inv.paidAt && inv.paidAmountCents !== null) {
    return { minimumPaymentCents, payment: { date: inv.paidAt, amountCents: Number(inv.paidAmountCents) } };
  }

  const payments = await db
    .select({ date: transactions.date, amountCents: transactions.amountCents })
    .from(transactions)
    .where(
      and(
        eq(transactions.invoiceId, invoiceId),
        eq(transactions.kind, 'invoice_payment'),
        isNull(transactions.deletedAt),
        // Só a saída da conta pagadora (R6). O crédito "Pagamento recebido" na própria conta-cartão
        // também é invoice_payment da fatura e, se entrasse, dobraria o valor.
        lt(transactions.amountCents, 0),
        ne(transactions.accountId, inv.accountId),
      ),
    )
    .orderBy(asc(transactions.date));

  if (payments.length === 0) return { minimumPaymentCents, payment: null };

  return {
    minimumPaymentCents,
    payment: {
      date: inv.paidAt ?? payments[payments.length - 1]!.date,
      // Saída da conta corrente (negativa no banco, R1) exibida como valor positivo
      amountCents: payments.reduce((sum, p) => sum + Math.abs(Number(p.amountCents)), 0),
    },
  };
}
