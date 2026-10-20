import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, invoices, transactions, transactionSources } from '@/server/db/schema';
import { addDaysISO, addMonthsISO, monthStart, today as getToday } from '@/server/domain/dates';
import type { InvoiceStatus } from '@/server/domain/enums';
import { getInvoiceCycle } from '@/server/domain/invoice-cycle';
import type { PipelineContext } from './pipeline';
import type { RawInvoice } from './types';

export function computeInvoiceStatus(
  i: { closingDate: string; dueDate: string; paidAt: string | null },
  today: string,
): InvoiceStatus {
  if (i.paidAt) return 'paid';
  if (today > i.dueDate) return 'overdue';
  if (today > i.closingDate) return 'closed';
  return 'open';
}

function mostFrequentDay(days: number[]): number | null {
  if (days.length === 0) return null;
  const counts = new Map<number, number>();
  let bestDay = days[0]!;
  let bestCount = 0;
  for (const d of days) {
    const c = (counts.get(d) ?? 0) + 1;
    counts.set(d, c);
    if (c > bestCount) {
      bestCount = c;
      bestDay = d;
    }
  }
  return bestDay;
}

export function inferCycleFromBills(bills: Array<{ dueDate: string; closingDate: string | null }>): {
  closingDay: number | null;
  dueDay: number | null;
} {
  if (bills.length === 0) return { closingDay: null, dueDay: null };

  const dueDays = bills
    .map((b) => Number(b.dueDate.slice(8, 10)))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);

  const closingDays = bills
    .map((b) => {
      const closeStr = b.closingDate ?? addDaysISO(b.dueDate, -7);
      return Number(closeStr.slice(8, 10));
    })
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);

  return {
    closingDay: mostFrequentDay(closingDays),
    dueDay: mostFrequentDay(dueDays),
  };
}

function computeClosingDateForBill(
  dueDate: string,
  closingDateFromBill: string | null,
  closingDay: number | null,
  dueDay: number | null,
): string {
  if (closingDateFromBill) return closingDateFromBill;
  if (closingDay != null) {
    const effectiveDueDay = dueDay ?? Number(dueDate.slice(8, 10));
    const dueMonth = monthStart(dueDate);
    const closingMonth = closingDay < effectiveDueDay ? dueMonth : addMonthsISO(dueMonth, -1);
    return getInvoiceCycle(closingMonth, closingDay, effectiveDueDay).closingDate;
  }
  return addDaysISO(dueDate, -7);
}

export async function upsertInvoicesFromSource(
  db: Db,
  accountId: string,
  bills: RawInvoice[],
  account?: { closingDay: number | null; dueDay: number | null },
  todayStr = getToday(),
): Promise<void> {
  let acc = account;
  if (!acc) {
    const [row] = await db
      .select({ closingDay: accounts.closingDay, dueDay: accounts.dueDay })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    acc = row ?? { closingDay: null, dueDay: null };
  }

  let closingDay = acc.closingDay;
  let dueDay = acc.dueDay;

  if ((closingDay == null || dueDay == null) && bills.length > 0) {
    const inferred = inferCycleFromBills(bills);
    const nextClosing = closingDay ?? inferred.closingDay;
    const nextDue = dueDay ?? inferred.dueDay;
    if (nextClosing !== closingDay || nextDue !== dueDay) {
      closingDay = nextClosing;
      dueDay = nextDue;
      await db
        .update(accounts)
        .set({ closingDay, dueDay, updatedAt: new Date() })
        .where(eq(accounts.id, accountId));
    }
  }

  for (const bill of bills) {
    const referenceMonth = monthStart(bill.dueDate);
    const closingDate = computeClosingDateForBill(
      bill.dueDate,
      bill.closingDate,
      closingDay,
      dueDay,
    );

    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.accountId, accountId), eq(invoices.referenceMonth, referenceMonth)));

    const status = computeInvoiceStatus(
      { closingDate, dueDate: bill.dueDate, paidAt: existing?.paidAt ?? null },
      todayStr,
    );

    if (existing) {
      await db
        .update(invoices)
        .set({
          closingDate,
          dueDate: bill.dueDate,
          totalCents: bill.totalCents,
          minimumPaymentCents: bill.minimumPaymentCents,
          externalId: bill.externalId,
          status,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, existing.id));
    } else {
      await db.insert(invoices).values({
        accountId,
        referenceMonth,
        closingDate,
        dueDate: bill.dueDate,
        totalCents: bill.totalCents,
        minimumPaymentCents: bill.minimumPaymentCents,
        externalId: bill.externalId,
        status,
      });
    }
  }
}

function extractBillId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as {
    billId?: unknown;
    creditCardMetadata?: { billId?: unknown } | null;
  };
  if (typeof obj.creditCardMetadata?.billId === 'string' && obj.creditCardMetadata.billId) {
    return obj.creditCardMetadata.billId;
  }
  if (typeof obj.billId === 'string' && obj.billId) {
    return obj.billId;
  }
  return null;
}

export async function assignInvoices(
  db: Db,
  accountIds: string[],
  todayStr = getToday(),
): Promise<{ assigned: number; accountsMissingCycle: number }> {
  if (accountIds.length === 0) return { assigned: 0, accountsMissingCycle: 0 };

  const uniqueAccountIds = [...new Set(accountIds)];
  let assigned = 0;
  let accountsMissingCycle = 0;

  for (const accountId of uniqueAccountIds) {
    const [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (!acc || acc.type !== 'credit_card') continue;

    const existingInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.accountId, accountId));

    let closingDay = acc.closingDay;
    let dueDay = acc.dueDay;

    if ((closingDay == null || dueDay == null) && existingInvoices.length > 0) {
      const sourceInvs = existingInvoices.filter((i) => i.externalId !== null);
      const inferred = inferCycleFromBills(sourceInvs);
      const nextClosing = closingDay ?? inferred.closingDay;
      const nextDue = dueDay ?? inferred.dueDay;
      if (nextClosing !== closingDay || nextDue !== dueDay) {
        closingDay = nextClosing;
        dueDay = nextDue;
        await db
          .update(accounts)
          .set({ closingDay, dueDay, updatedAt: new Date() })
          .where(eq(accounts.id, accountId));
      }
    }

    const hasCycle = closingDay != null && dueDay != null;
    if (!hasCycle) {
      accountsMissingCycle++;
    }

    const byExternalId = new Map<string, (typeof existingInvoices)[number]>();
    const byRefMonth = new Map<string, (typeof existingInvoices)[number]>();
    for (const inv of existingInvoices) {
      if (inv.externalId) byExternalId.set(inv.externalId, inv);
      byRefMonth.set(inv.referenceMonth, inv);
    }

    const txRows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        invoiceId: transactions.invoiceId,
        raw: transactionSources.raw,
      })
      .from(transactions)
      .leftJoin(transactionSources, eq(transactionSources.transactionId, transactions.id))
      .where(and(eq(transactions.accountId, accountId), isNull(transactions.deletedAt)));

    for (const tx of txRows) {
      let targetInvoiceId: string | null = null;
      const billId = extractBillId(tx.raw);

      if (billId && byExternalId.has(billId)) {
        targetInvoiceId = byExternalId.get(billId)!.id;
      } else if (hasCycle) {
        const cycle = getInvoiceCycle(tx.date, closingDay!, dueDay!);
        let inv = byRefMonth.get(cycle.referenceMonth);

        if (!inv) {
          const status = computeInvoiceStatus(
            { closingDate: cycle.closingDate, dueDate: cycle.dueDate, paidAt: null },
            todayStr,
          );
          const [created] = await db
            .insert(invoices)
            .values({
              accountId,
              referenceMonth: cycle.referenceMonth,
              closingDate: cycle.closingDate,
              dueDate: cycle.dueDate,
              totalCents: 0,
              status,
            })
            .returning();
          inv = created!;
          byRefMonth.set(cycle.referenceMonth, inv);
        } else if (
          inv.externalId === null &&
          (inv.closingDate !== cycle.closingDate || inv.dueDate !== cycle.dueDate)
        ) {
          const status = computeInvoiceStatus(
            { closingDate: cycle.closingDate, dueDate: cycle.dueDate, paidAt: inv.paidAt },
            todayStr,
          );
          const [updated] = await db
            .update(invoices)
            .set({
              closingDate: cycle.closingDate,
              dueDate: cycle.dueDate,
              status,
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, inv.id))
            .returning();
          inv = updated!;
          byRefMonth.set(cycle.referenceMonth, inv);
        }

        targetInvoiceId = inv.id;
      }

      if (targetInvoiceId && tx.invoiceId !== targetInvoiceId) {
        await db
          .update(transactions)
          .set({ invoiceId: targetInvoiceId, updatedAt: new Date() })
          .where(eq(transactions.id, tx.id));
        assigned++;
      }
    }
  }

  return { assigned, accountsMissingCycle };
}

export async function recalculateInvoices(
  db: Db,
  accountIds: string[],
  todayStr = getToday(),
): Promise<void> {
  if (accountIds.length === 0) return;
  const uniqueAccountIds = [...new Set(accountIds)];

  const invRows = await db
    .select()
    .from(invoices)
    .where(inArray(invoices.accountId, uniqueAccountIds));
  if (invRows.length === 0) return;

  const txRows = await db
    .select({
      invoiceId: transactions.invoiceId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, uniqueAccountIds),
        isNull(transactions.deletedAt),
        ne(transactions.kind, 'invoice_payment'),
      ),
    );

  const sumByInvoice = new Map<string, number>();
  for (const tx of txRows) {
    if (!tx.invoiceId) continue;
    sumByInvoice.set(tx.invoiceId, (sumByInvoice.get(tx.invoiceId) ?? 0) + tx.amountCents);
  }

  for (const inv of invRows) {
    const nextStatus = computeInvoiceStatus(
      { closingDate: inv.closingDate, dueDate: inv.dueDate, paidAt: inv.paidAt },
      todayStr,
    );
    const sumAmount = sumByInvoice.get(inv.id) ?? 0;
    const computedTotal = -sumAmount || 0;
    const nextTotal = inv.externalId !== null ? inv.totalCents : computedTotal;

    if (inv.status !== nextStatus || inv.totalCents !== nextTotal) {
      await db
        .update(invoices)
        .set({
          status: nextStatus,
          totalCents: nextTotal,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, inv.id));
    }
  }
}

export async function runInvoicesPipelineStep(ctx: PipelineContext): Promise<void> {
  const todayStr = ctx.today ?? getToday();
  if (ctx.invoicesByAccount) {
    for (const [accountId, bills] of Object.entries(ctx.invoicesByAccount)) {
      await upsertInvoicesFromSource(ctx.db, accountId, bills, undefined, todayStr);
    }
  }

  const { assigned, accountsMissingCycle } = await assignInvoices(ctx.db, ctx.accountIds, todayStr);
  if (assigned > 0) {
    ctx.stats.invoicesAssigned = (ctx.stats.invoicesAssigned ?? 0) + assigned;
  }
  if (accountsMissingCycle > 0) {
    ctx.stats.accountsMissingCycle = (ctx.stats.accountsMissingCycle ?? 0) + accountsMissingCycle;
  }

  await recalculateInvoices(ctx.db, ctx.accountIds, todayStr);
}
