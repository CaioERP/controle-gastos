import { eq, sql } from 'drizzle-orm';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Db } from '@/server/db/client';
import { accounts, categories, spendingLimits } from '@/server/db/schema';
import { today as getToday } from '@/server/domain/dates';
import type { LimitPeriod, PaymentMethod } from '@/server/domain/enums';
import { PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import { buildLimitActionUrl, getLimitPeriodRange, getLimitSpent } from '@/server/limits/engine';
import { suggestBudgets } from '@/server/limits/suggest';

export type SpendingLimitRow = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  paymentMethod: PaymentMethod | null;
  paymentMethodLabel: string | null;
  accountId: string | null;
  accountName: string | null;
  period: LimitPeriod;
  amountCents: number;
  spentCents: number;
  spentPercent: number; // ex.: 85 para 85%
  status: 'ok' | 'warning' | 'exceeded'; // ok < 80%, warning 80-99%, exceeded >= 100%
  paceStatus: 'on_track' | 'accelerated' | null;
  projectedExceedDays: number | null; // ex.: 8 dias
  notifyPace: boolean;
  isActive: boolean;
  periodFrom: string;
  periodTo: string;
  actionUrl: string; // link para /transacoes com filtros aplicados
  thresholds?: number[];
};

export type SuggestedBudgetRow = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  average3mCents: number;
  suggestedCents: number;
  currentLimitCents: number | null;
};

export type LimitsOverview = {
  totalBudgetedCents: number;
  totalSpentCents: number;
  spentPercent: number;
  limitsCount: number;
  warningCount: number;
  exceededCount: number;
  limits: SpendingLimitRow[];
  suggestions: SuggestedBudgetRow[];
};

export async function getLimitsOverview(
  db: Db,
  refDate: string = getToday(),
): Promise<LimitsOverview> {
  const dbLimits = await db
    .select({
      id: spendingLimits.id,
      name: spendingLimits.name,
      categoryId: spendingLimits.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      paymentMethod: spendingLimits.paymentMethod,
      accountId: spendingLimits.accountId,
      accountName: sql<string | null>`coalesce(${accounts.displayName}, ${accounts.name})`,
      period: spendingLimits.period,
      amountCents: spendingLimits.amountCents,
      thresholds: spendingLimits.thresholds,
      notifyPace: spendingLimits.notifyPace,
      isActive: spendingLimits.isActive,
    })
    .from(spendingLimits)
    .leftJoin(categories, eq(categories.id, spendingLimits.categoryId))
    .leftJoin(accounts, eq(accounts.id, spendingLimits.accountId));

  const limits: SpendingLimitRow[] = [];

  for (const limit of dbLimits) {
    const range = getLimitPeriodRange(limit.period, refDate);
    const spentCents = await getLimitSpent(
      db,
      {
        categoryId: limit.categoryId,
        paymentMethod: limit.paymentMethod,
        accountId: limit.accountId,
      },
      range,
    );

    const spentPercent =
      limit.amountCents > 0 ? Math.round((spentCents / limit.amountCents) * 100) : 0;

    const status: 'ok' | 'warning' | 'exceeded' =
      spentPercent >= 100 ? 'exceeded' : spentPercent >= 80 ? 'warning' : 'ok';

    let paceStatus: 'on_track' | 'accelerated' | null = null;
    let projectedExceedDays: number | null = null;

    if (limit.notifyPace && limit.isActive) {
      if (spentPercent >= 100) {
        paceStatus = null;
      } else {
        const D = differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1;
        const dRaw = differenceInCalendarDays(parseISO(refDate), parseISO(range.from)) + 1;
        const d = Math.max(1, Math.min(D, dRaw));
        const p = d / D;

        if (p >= 0.25 && spentCents > 0) {
          const projectedTotal = Math.round((spentCents / d) * D);
          if (projectedTotal > limit.amountCents) {
            const dEstouro = Math.ceil((limit.amountCents * d) / spentCents);
            if (dEstouro <= D) {
              paceStatus = 'accelerated';
              projectedExceedDays = Math.max(1, dEstouro - d);
            } else {
              paceStatus = 'on_track';
            }
          } else {
            paceStatus = 'on_track';
          }
        } else {
          paceStatus = 'on_track';
        }
      }
    }

    const actionUrl = buildLimitActionUrl({
      from: range.from,
      to: range.to,
      categoryId: limit.categoryId,
      paymentMethod: limit.paymentMethod,
      accountId: limit.accountId,
    });

    limits.push({
      id: limit.id,
      name: limit.name,
      categoryId: limit.categoryId,
      categoryName: limit.categoryName,
      categoryColor: limit.categoryColor,
      paymentMethod: limit.paymentMethod,
      paymentMethodLabel: limit.paymentMethod ? PAYMENT_METHOD_LABELS[limit.paymentMethod] : null,
      accountId: limit.accountId,
      accountName: limit.accountName,
      period: limit.period,
      amountCents: limit.amountCents,
      spentCents,
      spentPercent,
      status,
      paceStatus,
      projectedExceedDays,
      notifyPace: limit.notifyPace,
      isActive: limit.isActive,
      periodFrom: range.from,
      periodTo: range.to,
      actionUrl,
      thresholds: limit.thresholds,
    });
  }

  // Ordenação: ativos primeiro; depois maior percentual gasto; depois nome
  limits.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.spentPercent !== b.spentPercent) return b.spentPercent - a.spentPercent;
    return a.name.localeCompare(b.name);
  });

  const rawSuggestions = await suggestBudgets(db, refDate);
  const suggestions: SuggestedBudgetRow[] = rawSuggestions.map((s) => ({
    categoryId: s.categoryId,
    categoryName: s.categoryName,
    categoryColor: s.categoryColor,
    average3mCents: s.averageCents,
    suggestedCents: s.suggestedAmountCents,
    currentLimitCents: s.currentLimitCents,
  }));

  const activeLimits = limits.filter((l) => l.isActive);
  const totalBudgetedCents = activeLimits.reduce((acc, l) => acc + l.amountCents, 0);
  const totalSpentCents = activeLimits.reduce((acc, l) => acc + l.spentCents, 0);
  const spentPercent =
    totalBudgetedCents > 0 ? Math.round((totalSpentCents / totalBudgetedCents) * 100) : 0;
  const limitsCount = activeLimits.length;
  const warningCount = activeLimits.filter((l) => l.status === 'warning').length;
  const exceededCount = activeLimits.filter((l) => l.status === 'exceeded').length;

  return {
    totalBudgetedCents,
    totalSpentCents,
    spentPercent,
    limitsCount,
    warningCount,
    exceededCount,
    limits,
    suggestions,
  };
}
