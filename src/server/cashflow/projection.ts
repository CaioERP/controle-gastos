import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  categories,
  recurrences,
  transactions,
} from '@/server/db/schema';
import type { AccountType } from '@/server/domain/enums';
import {
  addMonthsISO,
  monthEnd,
  monthStart,
  today as getToday,
} from '@/server/domain/dates';
import { normalizeForMatch } from '@/server/ingestion/strings';
import { getFutureInstallments } from '@/server/queries/installments';
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
      categoryKind: categories.kind,
    })
    .from(recurrences)
    .leftJoin(categories, eq(recurrences.categoryId, categories.id))
    .where(eq(recurrences.status, 'active'));

  let projectedIncomeCents = 0;
  let fixedExpensesCents = 0;

  const recMerchantIds = new Set<string>();
  const recDescriptions = new Set<string>();

  for (const rec of activeRecurrences) {
    if (rec.merchantId) {
      recMerchantIds.add(rec.merchantId);
    }
    recDescriptions.add(normalizeForMatch(rec.description));

    const nominalAmount = rec.lastAmountCents || rec.amountCents;
    let monthlyAmount = 0;

    switch (rec.frequency) {
      case 'weekly':
        monthlyAmount = Math.round((nominalAmount * 52) / 12);
        break;
      case 'biweekly':
        monthlyAmount = nominalAmount * 2;
        break;
      case 'monthly':
        monthlyAmount = nominalAmount;
        break;
      case 'quarterly':
        monthlyAmount = Math.round(nominalAmount / 3);
        break;
      case 'yearly':
        monthlyAmount = Math.round(nominalAmount / 12);
        break;
      default:
        monthlyAmount = nominalAmount;
        break;
    }

    if (rec.categoryKind === 'income') {
      projectedIncomeCents += monthlyAmount;
    } else {
      fixedExpensesCents += monthlyAmount;
    }
  }

  // 3. Parcelas de cartão de crédito e faturas já abertas via getFutureInstallments
  const futureInstallments = await getFutureInstallments(
    db,
    {},
    { today: todayDate },
  );
  const installmentsByMonth = new Map<string, number>();
  for (const item of futureInstallments) {
    installmentsByMonth.set(item.month.slice(0, 7), item.totalCents);
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
    .where(
      and(
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
