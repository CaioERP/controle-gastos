import { and, eq, inArray, lte, ne } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, categories, invoices, recurrences } from '@/server/db/schema';
import { monthEnd, today as getToday } from '@/server/domain/dates';
import { recurrenceOccurrences } from '@/server/cashflow/projection';
import { getAccountsOverview } from '@/server/queries/accounts';
import { cashAccountIds, creditCardAccountIds } from './accounts';

export type FreeToSpendEvent = {
  date: string; // YYYY-MM-DD
  kind: 'invoice' | 'fixed_expense' | 'income';
  label: string; // "Fatura Nubank", "Aluguel", "Salário"
  amountCents: number; // sempre positivo; o kind diz o sinal
};

export type FreeToSpend = {
  untilDate: string; // último dia do mês
  balanceCents: number; // saldo das contas de caixa hoje
  invoicesCents: number;
  fixedExpensesCents: number;
  incomeCents: number;
  freeCents: number; // balance - invoices - fixed + income (pode ser negativo)
  events: FreeToSpendEvent[]; // ordenados por data; usados pela A6-03 para a linha de previsão
};

export function computeFreeToSpend(
  balanceCents: number,
  events: FreeToSpendEvent[],
  untilDate: string,
): FreeToSpend {
  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));

  let invoicesCents = 0;
  let fixedExpensesCents = 0;
  let incomeCents = 0;

  for (const ev of sortedEvents) {
    if (ev.kind === 'invoice') {
      invoicesCents += ev.amountCents;
    } else if (ev.kind === 'fixed_expense') {
      fixedExpensesCents += ev.amountCents;
    } else if (ev.kind === 'income') {
      incomeCents += ev.amountCents;
    }
  }

  const freeCents = balanceCents - invoicesCents - fixedExpensesCents + incomeCents;

  return {
    untilDate,
    balanceCents,
    invoicesCents,
    fixedExpensesCents,
    incomeCents,
    freeCents,
    events: sortedEvents,
  };
}

export async function getFreeToSpend(
  db: Db,
  opts: { today?: string } = {},
): Promise<FreeToSpend> {
  const todayStr = opts.today ?? getToday();
  const untilDate = monthEnd(todayStr);

  const overview = await getAccountsOverview(db, { today: todayStr });
  const cashIds = new Set(cashAccountIds(overview));
  const cardIds = creditCardAccountIds(overview);

  // 1. Saldo das contas de caixa hoje
  let balanceCents = 0;
  for (const inst of overview) {
    for (const acc of inst.accounts) {
      if (cashIds.has(acc.id)) {
        balanceCents += acc.balanceCents;
      }
    }
  }

  const events: FreeToSpendEvent[] = [];

  // 2. Faturas: invoices com status <> 'paid' e dueDate <= monthEnd(today) de cartões considerados
  if (cardIds.length > 0) {
    const unpaidInvoices = await db
      .select({
        id: invoices.id,
        dueDate: invoices.dueDate,
        totalCents: invoices.totalCents,
        accountName: accounts.name,
        accountDisplayName: accounts.displayName,
      })
      .from(invoices)
      .innerJoin(accounts, eq(accounts.id, invoices.accountId))
      .where(
        and(
          inArray(invoices.accountId, cardIds),
          ne(invoices.status, 'paid'),
          lte(invoices.dueDate, untilDate),
        ),
      );

    for (const inv of unpaidInvoices) {
      const cardName = inv.accountDisplayName ?? inv.accountName;
      events.push({
        date: inv.dueDate,
        kind: 'invoice',
        label: `Fatura ${cardName}`,
        amountCents: Math.max(0, inv.totalCents),
      });
    }
  }

  // 3. Contas fixas e receitas: recurrences com status = 'active'
  // Não conte duas vezes: ignore paymentMethod de cartão ou conta do tipo credit_card
  const activeRecurrences = await db
    .select({
      id: recurrences.id,
      description: recurrences.description,
      amountCents: recurrences.amountCents,
      lastAmountCents: recurrences.lastAmountCents,
      frequency: recurrences.frequency,
      lastDate: recurrences.lastDate,
      paymentMethod: recurrences.paymentMethod,
      accountId: recurrences.accountId,
      accountType: accounts.type,
      categoryKind: categories.kind,
    })
    .from(recurrences)
    .leftJoin(categories, eq(recurrences.categoryId, categories.id))
    .leftJoin(accounts, eq(recurrences.accountId, accounts.id))
    .where(eq(recurrences.status, 'active'));

  for (const rec of activeRecurrences) {
    if (
      rec.paymentMethod === 'credit_card_single' ||
      rec.paymentMethod === 'credit_card_installment' ||
      rec.accountType === 'credit_card'
    ) {
      continue;
    }

    const occurrences = recurrenceOccurrences(
      rec.lastDate,
      rec.frequency,
      todayStr,
      untilDate,
    );
    const nominalAmount = Math.abs(rec.lastAmountCents || rec.amountCents);
    const kind = rec.categoryKind === 'income' ? 'income' : 'fixed_expense';

    for (const d of occurrences) {
      events.push({
        date: d,
        kind,
        label: rec.description,
        amountCents: nominalAmount,
      });
    }
  }

  return computeFreeToSpend(balanceCents, events, untilDate);
}
