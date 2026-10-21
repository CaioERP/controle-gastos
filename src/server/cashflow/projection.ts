import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  categories,
  invoices,
  recurrences,
  transactions,
} from '@/server/db/schema';
import type { AccountType, RecurrenceFrequency } from '@/server/domain/enums';
import {
  addDaysISO,
  addMonthsISO,
  monthEnd,
  monthStart,
  today as getToday,
} from '@/server/domain/dates';
import { normalizeForMatch } from '@/server/ingestion/strings';
import { notSplitParent } from '@/server/queries/split-filter';

export type MonthlyCashFlowPoint = {
  month: string; // YYYY-MM
  startingBalanceCents: number;
  projectedIncomeCents: number;
  fixedExpensesCents: number;
  cardInstallmentsCents: number;
  variableExpensesCents: number;
  projectedBalanceCents: number;
  lowerBandCents: number;
  upperBandCents: number;
};

export type CashFlowProjection = {
  currentBalanceCents: number;
  horizonMonths: number;
  points: MonthlyCashFlowPoint[];
  lowestProjectedBalanceCents: number;
  lowestBalanceMonth: string;
  hasDeficitRisk: boolean; // true se lowerBandCents < 0 em algum mês
};

const LIQUID_ACCOUNT_TYPES: AccountType[] = [
  'checking',
  'savings',
  'wallet',
  'benefit',
];

/**
 * Datas futuras (estritamente depois de `after` e até `until`) em que uma recorrência
 * deve ocorrer, contando a partir da última ocorrência real. Meses curtos são
 * ajustados pelo date-fns (31/01 + 1 mês = 28/02); recorrências anuais e trimestrais
 * caem só no mês certo, e a virada de ano é natural.
 */
export function recurrenceOccurrences(
  lastDate: string,
  frequency: RecurrenceFrequency,
  after: string,
  until: string,
): string[] {
  const out: string[] = [];
  for (let k = 1; k <= 5000; k++) {
    let d: string;
    switch (frequency) {
      case 'weekly':
        d = addDaysISO(lastDate, 7 * k);
        break;
      case 'biweekly':
        d = addDaysISO(lastDate, 14 * k);
        break;
      case 'quarterly':
        d = addMonthsISO(lastDate, 3 * k);
        break;
      case 'yearly':
        d = addMonthsISO(lastDate, 12 * k);
        break;
      default:
        d = addMonthsISO(lastDate, k);
        break;
    }
    if (d > until) break;
    if (d > after) out.push(d);
  }
  return out;
}

function addTo(map: Map<string, number>, key: string, cents: number) {
  map.set(key, (map.get(key) ?? 0) + cents);
}

/**
 * Calcula a projeção de fluxo de caixa para os próximos meses (padrão: 6 meses),
 * partindo do saldo líquido atual, considerando receitas recorrentes, despesas fixas,
 * parcelas futuras de cartão e média de gastos variáveis com faixa de incerteza estatística (+- 1.96 * sigma).
 */
export async function getCashFlowProjection(
  db: Db,
  opts?: { monthsAhead?: number; today?: string },
): Promise<CashFlowProjection> {
  const horizonMonths = opts?.monthsAhead ?? 6;
  const todayDate = opts?.today ?? getToday();
  const currentMonth = monthStart(todayDate);

  // 1. Ponto de Partida (S0): Soma dos saldos das contas líquidas com includeInTotals = true
  const liquidAccounts = await db
    .select({ balanceCents: accounts.balanceCents })
    .from(accounts)
    .where(
      and(
        eq(accounts.includeInTotals, true),
        eq(accounts.isHidden, false),
        inArray(accounts.type, LIQUID_ACCOUNT_TYPES),
      ),
    );

  const currentBalanceCents = liquidAccounts.reduce(
    (acc, a) => acc + (a.balanceCents ?? 0),
    0,
  );

  // 2. Componentes Determinísticos Recorrentes: Tabela recurrences ativas
  const activeRecurrences = await db
    .select({
      id: recurrences.id,
      merchantId: recurrences.merchantId,
      description: recurrences.description,
      amountCents: recurrences.amountCents,
      lastAmountCents: recurrences.lastAmountCents,
      frequency: recurrences.frequency,
      lastDate: recurrences.lastDate,
      categoryKind: categories.kind,
    })
    .from(recurrences)
    .leftJoin(categories, eq(recurrences.categoryId, categories.id))
    .where(eq(recurrences.status, 'active'));

  // Chaves dos meses projetados. Ocorrências que ainda caem no mês corrente (depois de hoje)
  // são somadas ao primeiro mês projetado, para não perder saídas já previstas.
  const firstKey = addMonthsISO(currentMonth, 1).slice(0, 7);
  const horizonEnd = monthEnd(addMonthsISO(currentMonth, horizonMonths));
  const bucketKey = (date: string) => {
    const key = date.slice(0, 7);
    return key <= currentMonth.slice(0, 7) ? firstKey : key;
  };

  const incomeByMonth = new Map<string, number>();
  const fixedByMonth = new Map<string, number>();

  const recMerchantIds = new Set<string>();
  const recDescriptions = new Set<string>();

  for (const rec of activeRecurrences) {
    if (rec.merchantId) {
      recMerchantIds.add(rec.merchantId);
    }
    recDescriptions.add(normalizeForMatch(rec.description));

    const nominalAmount = Math.abs(rec.lastAmountCents || rec.amountCents);
    const target = rec.categoryKind === 'income' ? incomeByMonth : fixedByMonth;
    for (const d of recurrenceOccurrences(
      rec.lastDate,
      rec.frequency,
      todayDate,
      horizonEnd,
    )) {
      addTo(target, bucketKey(d), nominalAmount);
    }
  }

  // 3. Saídas de cartão em regime de caixa: a fatura entra na data de vencimento.
  //    - Faturas não pagas: valor da fatura (ou, se maior, a soma das parcelas projetadas ligadas a ela).
  //    - Parcelas projetadas sem fatura: na data da parcela.
  const unpaidInvoices = await db
    .select({ id: invoices.id, dueDate: invoices.dueDate, totalCents: invoices.totalCents })
    .from(invoices)
    .where(and(ne(invoices.status, 'paid'), sql`${invoices.dueDate} <= ${horizonEnd}`));

  const projectedTxs = await db
    .select({
      invoiceId: transactions.invoiceId,
      date: transactions.date,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        notSplitParent,
        eq(transactions.status, 'projected'),
        sql`${transactions.date} <= ${horizonEnd}`,
      ),
    );

  const projectedByInvoice = new Map<string, number>();
  const installmentsByMonth = new Map<string, number>();
  for (const tx of projectedTxs) {
    const cents = Math.abs(tx.amountCents);
    if (tx.invoiceId) {
      addTo(projectedByInvoice, tx.invoiceId, cents);
    } else if (tx.date >= currentMonth) {
      addTo(installmentsByMonth, bucketKey(tx.date), cents);
    }
  }
  for (const inv of unpaidInvoices) {
    const cents = Math.max(
      Math.max(0, inv.totalCents ?? 0),
      projectedByInvoice.get(inv.id) ?? 0,
    );
    addTo(installmentsByMonth, bucketKey(inv.dueDate), cents);
  }

  // 4. Componente Variável (D_var) e Incerteza (sigma_var) nos últimos 3 meses cheios
  const m1 = addMonthsISO(currentMonth, -1);
  const m2 = addMonthsISO(currentMonth, -2);
  const m3 = addMonthsISO(currentMonth, -3);

  const pastMonths = [
    { key: m3.slice(0, 7), from: m3, to: monthEnd(m3) },
    { key: m2.slice(0, 7), from: m2, to: monthEnd(m2) },
    { key: m1.slice(0, 7), from: m1, to: monthEnd(m1) },
  ];

  const historicalTxs = await db
    .select({
      date: transactions.date,
      amountCents: transactions.amountCents,
      kind: transactions.kind,
      description: transactions.description,
      merchantId: transactions.merchantId,
      paymentMethod: transactions.paymentMethod,
      installmentTotal: transactions.installmentTotal,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(accounts.includeInTotals, true),
        eq(accounts.isHidden, false),
        inArray(transactions.kind, ['expense', 'refund']),
        ne(transactions.status, 'projected'),
        isNull(transactions.deletedAt),
        notSplitParent,
        sql`${transactions.date} >= ${m3}`,
        sql`${transactions.date} <= ${monthEnd(m1)}`,
      ),
    );

  const monthlyVarExpenses = new Map<string, number>([
    [pastMonths[0]!.key, 0],
    [pastMonths[1]!.key, 0],
    [pastMonths[2]!.key, 0],
  ]);

  for (const tx of historicalTxs) {
    // Exclui transações que já constam em recurrences (fixas)
    if (
      (tx.merchantId && recMerchantIds.has(tx.merchantId)) ||
      recDescriptions.has(normalizeForMatch(tx.description))
    ) {
      continue;
    }

    // Exclui compras parceladas de cartão (já entram nas parcelas futuras para evitar dupla contagem)
    if (
      tx.paymentMethod === 'credit_card_installment' ||
      (tx.installmentTotal !== null && tx.installmentTotal > 1)
    ) {
      continue;
    }

    const monthKey = tx.date.slice(0, 7);
    if (monthlyVarExpenses.has(monthKey)) {
      const current = monthlyVarExpenses.get(monthKey) ?? 0;
      // Estorno abate da despesa (R2)
      const cost =
        tx.kind === 'expense'
          ? Math.abs(tx.amountCents)
          : -Math.abs(tx.amountCents);
      monthlyVarExpenses.set(monthKey, current + cost);
    }
  }

  const varValues = Array.from(monthlyVarExpenses.values()).map((v) =>
    Math.max(0, v),
  );
  const avgVar =
    varValues.reduce((acc, v) => acc + v, 0) / (varValues.length || 1);
  const variance =
    varValues.reduce((acc, v) => acc + Math.pow(v - avgVar, 2), 0) /
    (varValues.length || 1);
  const sigmaVar = Math.sqrt(variance);

  // 5. Cálculo da Trajetória e Faixas de Incerteza para os próximos meses (m = 1 .. horizonMonths)
  let runningBalance = currentBalanceCents;
  const points: MonthlyCashFlowPoint[] = [];

  for (let m = 1; m <= horizonMonths; m++) {
    const targetDate = addMonthsISO(currentMonth, m);
    const monthKey = targetDate.slice(0, 7);
    const startingBalanceCents = runningBalance;

    const projectedIncomeCents = incomeByMonth.get(monthKey) ?? 0;
    const fixedExpensesCents = fixedByMonth.get(monthKey) ?? 0;
    const cardInstallmentsCents = installmentsByMonth.get(monthKey) ?? 0;
    const variableExpensesCents = Math.round(avgVar);

    const projectedBalanceCents =
      startingBalanceCents +
      projectedIncomeCents -
      fixedExpensesCents -
      cardInstallmentsCents -
      variableExpensesCents;

    runningBalance = projectedBalanceCents;

    const sigmaAccumulated = Math.sqrt(m) * sigmaVar;
    const lowerBandCents = Math.round(projectedBalanceCents - 1.96 * sigmaAccumulated);
    const upperBandCents = Math.round(projectedBalanceCents + 1.96 * sigmaAccumulated);

    points.push({
      month: monthKey,
      startingBalanceCents,
      projectedIncomeCents,
      fixedExpensesCents,
      cardInstallmentsCents,
      variableExpensesCents,
      projectedBalanceCents,
      lowerBandCents,
      upperBandCents,
    });
  }

  let lowestProjectedBalanceCents =
    points[0]?.projectedBalanceCents ?? currentBalanceCents;
  let lowestBalanceMonth = points[0]?.month ?? '';

  for (const p of points) {
    if (p.projectedBalanceCents < lowestProjectedBalanceCents) {
      lowestProjectedBalanceCents = p.projectedBalanceCents;
      lowestBalanceMonth = p.month;
    }
  }

  const hasDeficitRisk = points.some((p) => p.lowerBandCents < 0);

  return {
    currentBalanceCents,
    horizonMonths,
    points,
    lowestProjectedBalanceCents,
    lowestBalanceMonth,
    hasDeficitRisk,
  };
}
