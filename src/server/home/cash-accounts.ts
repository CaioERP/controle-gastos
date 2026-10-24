import { and, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { transactions } from '@/server/db/schema';
import { addDaysISO, today as getToday } from '@/server/domain/dates';
import { txPosted } from '@/server/ledger';
import { getAccountsOverview } from '@/server/queries/accounts';
import { cashAccountIds } from './accounts';
import { getFreeToSpend } from './free-to-spend';

export type CashInstitution = {
  id: string;
  name: string;
  color: string;
  balanceCents: number;
};

export type BalancePoint = {
  date: string;
  balanceCents: number;
  projected: boolean;
};

export type CashFlowBreakdown = {
  inCents: number; // entradas (positivo)
  outCents: number; // saídas (positivo)
  netCents: number; // in - out
  out: {
    expenseCents: number;
    invoicePaymentCents: number;
    investmentCents: number;
    otherCents: number;
  };
};

export type CashAccountsTab = {
  accountIds: string[]; // contas de caixa, para os links e a rosca da aba
  balanceCents: number;
  institutions: CashInstitution[]; // maior saldo primeiro; só instituições com conta de caixa
  history: BalancePoint[]; // 90 dias até hoje (projected=false) + hoje..fim do mês (projected=true)
  flow: CashFlowBreakdown; // mês do filtro
};

/**
 * Volta no tempo a partir do saldo de hoje: saldo(d) = saldo(d+1) - movimento do dia d+1.
 * dailyNet: soma de amount_cents por dia (todas as naturezas), só contas de caixa e status 'posted'.
 */
export function rebuildDailyBalance(
  todayBalanceCents: number,
  dailyNet: Map<string, number>,
  from: string,
  today: string,
): BalancePoint[] {
  const dates: string[] = [];
  let curr = from;
  while (curr <= today) {
    dates.push(curr);
    curr = addDaysISO(curr, 1);
  }

  if (dates.length === 0) return [];

  const balances: number[] = new Array(dates.length);
  balances[dates.length - 1] = todayBalanceCents;

  for (let i = dates.length - 2; i >= 0; i--) {
    const nextDate = dates[i + 1]!;
    const nextDayNet = dailyNet.get(nextDate) ?? 0;
    balances[i] = balances[i + 1]! - nextDayNet;
  }

  return dates.map((date, i) => ({
    date,
    balanceCents: balances[i]!,
    projected: false,
  }));
}

export async function getCashAccountsTab(
  db: Db,
  period: { from: string; to: string },
  opts: { today?: string } = {},
): Promise<CashAccountsTab> {
  const todayStr = opts.today ?? getToday();
  const overview = await getAccountsOverview(db, { today: todayStr });
  const cashIds = cashAccountIds(overview);
  const cashIdSet = new Set(cashIds);

  // 1. Saldo total de caixa hoje e agrupado por instituição
  let balanceCents = 0;
  const institutions: CashInstitution[] = [];

  for (const inst of overview) {
    const cashAccs = inst.accounts.filter((a) => cashIdSet.has(a.id));
    if (cashAccs.length > 0) {
      const instBalance = cashAccs.reduce((sum, a) => sum + a.balanceCents, 0);
      balanceCents += instBalance;
      institutions.push({
        id: inst.institution.id,
        name: inst.institution.name,
        color: inst.institution.color,
        balanceCents: instBalance,
      });
    }
  }

  institutions.sort((a, b) => b.balanceCents - a.balanceCents);

  // 2. Saldo diário dos últimos 90 dias reconstruído
  const historyFrom = addDaysISO(todayStr, -90);
  const dailyNetRows =
    cashIds.length > 0
      ? await db
          .select({
            date: transactions.date,
            netCents: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
          })
          .from(transactions)
          .where(
            and(
              inArray(transactions.accountId, cashIds),
              txPosted,
              sql`${transactions.date} > ${historyFrom}`,
              sql`${transactions.date} <= ${todayStr}`,
            ),
          )
          .groupBy(transactions.date)
      : [];

  const dailyNet = new Map<string, number>();
  for (const r of dailyNetRows) {
    if (r.date) {
      dailyNet.set(r.date, Number(r.netCents));
    }
  }

  const historicalPoints = rebuildDailyBalance(
    balanceCents,
    dailyNet,
    historyFrom,
    todayStr,
  );

  // 3. Linha de previsão até o fim do mês com eventos do Livre para gastar
  const fts = await getFreeToSpend(db, opts);
  const untilDate = fts.untilDate;

  const projectedPoints: BalancePoint[] = [
    {
      date: todayStr,
      balanceCents,
      projected: true,
    },
  ];

  const eventDeltas = new Map<string, number>();
  const nextDay = addDaysISO(todayStr, 1);
  for (const ev of fts.events) {
    const delta = ev.kind === 'income' ? ev.amountCents : -ev.amountCents;
    const effectiveDate = ev.date <= todayStr ? nextDay : ev.date;
    eventDeltas.set(effectiveDate, (eventDeltas.get(effectiveDate) ?? 0) + delta);
  }

  let runningBalance = balanceCents;
  let curr = nextDay;
  while (curr <= untilDate) {
    const delta = eventDeltas.get(curr) ?? 0;
    runningBalance += delta;
    projectedPoints.push({
      date: curr,
      balanceCents: runningBalance,
      projected: true,
    });
    curr = addDaysISO(curr, 1);
  }

  const history = [...historicalPoints, ...projectedPoints];

  // 4. Entradas e saídas das contas de caixa no período
  const periodTxs =
    cashIds.length > 0
      ? await db
          .select({
            kind: transactions.kind,
            amountCents: transactions.amountCents,
          })
          .from(transactions)
          .where(
            and(
              inArray(transactions.accountId, cashIds),
              txPosted,
              gte(transactions.date, period.from),
              lte(transactions.date, period.to),
              ne(transactions.kind, 'transfer'),
            ),
          )
      : [];

  let inCents = 0;
  let expenseCents = 0;
  let invoicePaymentCents = 0;
  let investmentCents = 0;
  let otherCents = 0;

  for (const tx of periodTxs) {
    const amt = tx.amountCents;
    if (amt > 0) {
      inCents += amt;
    } else if (amt < 0) {
      const outAmt = -amt;
      if (tx.kind === 'expense') {
        expenseCents += outAmt;
      } else if (tx.kind === 'invoice_payment') {
        invoicePaymentCents += outAmt;
      } else if (tx.kind === 'investment') {
        investmentCents += outAmt;
      } else {
        otherCents += outAmt;
      }
    }
  }

  const outCents =
    expenseCents + invoicePaymentCents + investmentCents + otherCents;
  const netCents = inCents - outCents;

  return {
    accountIds: cashIds,
    balanceCents,
    institutions,
    history,
    flow: {
      inCents,
      outCents,
      netCents,
      out: {
        expenseCents,
        invoicePaymentCents,
        investmentCents,
        otherCents,
      },
    },
  };
}
