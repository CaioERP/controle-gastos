import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { accounts, categories, invoices, spendingLimits, transactions } from '@/server/db/schema';
import { addMonthsISO, monthEnd, monthStart, today as getToday } from '@/server/domain/dates';
import { buildTxWhere, spendValue } from '@/server/queries/base';
import { spentForLimit } from './spent';

export type SuggestedBudget = {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  averageCents: number;
  suggestedAmountCents: number;
  currentLimitCents: number | null;
  differenceCents: number | null;
  monthsCount: number;
};

/**
 * Arredonda a média para cima no múltiplo de R$ 10 ou R$ 50 mais próximo:
 * - Menor que R$ 500,00 (< 50.000 centavos): múltiplo de R$ 10 (1.000 centavos)
 *   Ex.: R$ 342,10 (34.210) → R$ 350,00 (35.000)
 * - R$ 500,00 ou mais (>= 50.000 centavos): múltiplo de R$ 50 (5.000 centavos)
 *   Ex.: R$ 1.215,00 (121.500) → R$ 1.250,00 (125.000)
 */
export function roundSuggestedBudget(averageCents: number): number {
  if (averageCents < 50000) {
    return Math.ceil(averageCents / 1000) * 1000;
  }
  return Math.ceil(averageCents / 5000) * 5000;
}

/**
 * Sugere limites e orçamentos para cada categoria ativa com base na média dos últimos 3 meses cheios.
 */
export async function suggestBudgets(
  db: Db,
  refDate: string = getToday(),
): Promise<SuggestedBudget[]> {
  // 1. Identifica os 3 meses cheios anteriores a refDate
  const currentMonth = monthStart(refDate);
  const m1 = addMonthsISO(currentMonth, -1);
  const m2 = addMonthsISO(currentMonth, -2);
  const m3 = addMonthsISO(currentMonth, -3);

  const months = [
    { from: m1, to: monthEnd(m1) },
    { from: m2, to: monthEnd(m2) },
    { from: m3, to: monthEnd(m3) },
  ];

  // 2. Busca todas as categorias de despesa ativas
  const activeCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(and(eq(categories.kind, 'expense'), eq(categories.archived, false)));

  // 3. Busca limites ativos existentes
  const activeLimits = await db
    .select({
      id: spendingLimits.id,
      categoryId: spendingLimits.categoryId,
      amountCents: spendingLimits.amountCents,
      period: spendingLimits.period,
    })
    .from(spendingLimits)
    .where(and(eq(spendingLimits.isActive, true), eq(spendingLimits.period, 'monthly')));

  const limitsByCat = new Map<string, number>();
  for (const l of activeLimits) {
    if (l.categoryId) {
      limitsByCat.set(l.categoryId, l.amountCents);
    }
  }

  // Busca gastos dos 3 meses em lote (elimina N+1 de 3 consultas por categoria)
  const rowsByMonth = await Promise.all(
    months.map(async (m) => {
      const where = buildTxWhere(
        {
          from: m.from,
          to: m.to,
          basis: 'accrual',
        },
        { forTotals: true },
      );

      const rows = await db
        .select({
          categoryId: transactions.categoryId,
          categoryParentId: categories.parentId,
          paymentMethod: transactions.paymentMethod,
          accountId: transactions.accountId,
          spentCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
        })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
        .leftJoin(categories, eq(categories.id, transactions.categoryId))
        .where(where)
        .groupBy(
          transactions.categoryId,
          categories.parentId,
          transactions.paymentMethod,
          transactions.accountId,
        );

      return rows.map((r) => ({
        categoryId: r.categoryId,
        categoryParentId: r.categoryParentId,
        paymentMethod: r.paymentMethod,
        accountId: r.accountId,
        spentCents: Number(r.spentCents ?? 0),
      }));
    }),
  );

  const suggestions: SuggestedBudget[] = [];

  for (const cat of activeCategories) {
    const monthlySpends: number[] = [];

    for (const monthRows of rowsByMonth) {
      const spent = spentForLimit({ categoryId: cat.id }, monthRows);
      if (spent > 0) {
        monthlySpends.push(spent);
      }
    }

    // Descarta se não houver histórico regular (menos de 2 meses com despesas)
    if (monthlySpends.length < 2) {
      continue;
    }

    const totalCents = monthlySpends.reduce((acc, s) => acc + s, 0);
    const avgCents = Math.round(totalCents / monthlySpends.length);

    // Descarta média menor que R$ 50,00 (5.000 centavos)
    if (avgCents < 5000) {
      continue;
    }

    const suggestedAmountCents = roundSuggestedBudget(avgCents);
    const currentLimitCents = limitsByCat.get(cat.id) ?? null;
    const differenceCents =
      currentLimitCents !== null ? suggestedAmountCents - currentLimitCents : null;

    suggestions.push({
      categoryId: cat.id,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      categoryColor: cat.color,
      averageCents: avgCents,
      suggestedAmountCents,
      currentLimitCents,
      differenceCents,
      monthsCount: monthlySpends.length,
    });
  }

  // Ordena por maior sugestão de teto
  suggestions.sort((a, b) => b.suggestedAmountCents - a.suggestedAmountCents);

  return suggestions;
}
