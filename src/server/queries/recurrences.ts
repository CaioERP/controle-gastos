import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  categories,
  merchants,
  recurrences,
} from '@/server/db/schema';
import type {
  PaymentMethod,
  RecurrenceFrequency,
  RecurrenceStatus,
} from '@/server/domain/enums';
import {
  PAYMENT_METHOD_LABELS,
  RECURRENCE_FREQUENCY_LABELS,
} from '@/server/domain/labels';

export type RecurrenceRow = {
  id: string;
  description: string;
  merchantName: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  paymentMethodLabel: string | null;
  frequency: RecurrenceFrequency;
  frequencyLabel: string; // 'Mensal', 'Semanal', 'Anual'
  amountCents: number;
  monthlyAmountCents: number; // normalizado para mês (ex.: anual / 12)
  expectedDay: number | null; // dia da cobrança
  status: RecurrenceStatus;
  isSubscription: boolean;
  lastDate: string;
  lastAmountCents: number;
  hasPriceHike: boolean;
  previousAmountCents: number | null;
  autoDetected: boolean;
  merchantId?: string | null;
  categoryId?: string | null;
  accountId?: string | null;
  paymentMethod?: PaymentMethod | null;
  tolerancePercent?: number;
};

export type SubscriptionsSummary = {
  monthlyTotalCents: number;
  yearlyTotalCents: number;
  activeCount: number;
  priceHikesCount: number;
  items: RecurrenceRow[];
};

export function normalizeMonthlyAmount(cents: number, freq: RecurrenceFrequency): number {
  switch (freq) {
    case 'weekly':
      return Math.round((cents * 52) / 12);
    case 'biweekly':
      return Math.round((cents * 26) / 12);
    case 'monthly':
      return cents;
    case 'quarterly':
      return Math.round(cents / 3);
    case 'yearly':
      return Math.round(cents / 12);
  }
}

export async function getSubscriptionsSummary(
  db: Db,
  opts?: { status?: RecurrenceStatus },
): Promise<SubscriptionsSummary> {
  let query = db
    .select({
      id: recurrences.id,
      description: recurrences.description,
      merchantId: recurrences.merchantId,
      merchantName: merchants.name,
      categoryId: recurrences.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      accountId: recurrences.accountId,
      paymentMethod: recurrences.paymentMethod,
      frequency: recurrences.frequency,
      expectedDay: recurrences.expectedDay,
      amountCents: recurrences.amountCents,
      tolerancePercent: recurrences.tolerancePercent,
      status: recurrences.status,
      isSubscription: recurrences.isSubscription,
      firstDate: recurrences.firstDate,
      lastDate: recurrences.lastDate,
      lastAmountCents: recurrences.lastAmountCents,
      autoDetected: recurrences.autoDetected,
    })
    .from(recurrences)
    .leftJoin(merchants, eq(merchants.id, recurrences.merchantId))
    .leftJoin(categories, eq(categories.id, recurrences.categoryId))
    .leftJoin(accounts, eq(accounts.id, recurrences.accountId))
    .$dynamic();

  if (opts?.status) {
    query = query.where(eq(recurrences.status, opts.status));
  }

  const rows = await query;

  const items: RecurrenceRow[] = rows.map((r) => {
    const hasPriceHike = r.lastAmountCents > r.amountCents * 1.05; // mesmo limiar do detector
    const monthlyAmountCents = normalizeMonthlyAmount(
      hasPriceHike ? r.lastAmountCents : r.amountCents,
      r.frequency,
    );
    // Identifica se houve aumento recente de preço (> valor base)
    const previousAmountCents = hasPriceHike ? r.amountCents : null;

    return {
      id: r.id,
      description: r.description,
      merchantName: r.merchantName ?? null,
      categoryName: r.categoryName ?? null,
      categoryColor: r.categoryColor ?? null,
      paymentMethodLabel: r.paymentMethod ? PAYMENT_METHOD_LABELS[r.paymentMethod] : null,
      frequency: r.frequency,
      frequencyLabel: RECURRENCE_FREQUENCY_LABELS[r.frequency] || r.frequency,
      amountCents: r.amountCents,
      monthlyAmountCents,
      expectedDay: r.expectedDay ?? null,
      status: r.status,
      isSubscription: r.isSubscription,
      lastDate: r.lastDate,
      lastAmountCents: r.lastAmountCents,
      hasPriceHike,
      previousAmountCents,
      autoDetected: r.autoDetected,
      merchantId: r.merchantId,
      categoryId: r.categoryId,
      accountId: r.accountId,
      paymentMethod: r.paymentMethod,
      tolerancePercent: r.tolerancePercent,
    };
  });

  // Ordenação: ativas primeiro, depois assinaturas, depois maior impacto mensal
  items.sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === 'active') return -1;
      if (b.status === 'active') return 1;
    }
    if (a.isSubscription !== b.isSubscription) {
      return a.isSubscription ? -1 : 1;
    }
    if (b.monthlyAmountCents !== a.monthlyAmountCents) {
      return b.monthlyAmountCents - a.monthlyAmountCents;
    }
    return a.description.localeCompare(b.description);
  });

  // Consolidação dos totais (apenas recorrências com status 'active')
  const activeItems = items.filter((r) => r.status === 'active');
  const monthlyTotalCents = activeItems.reduce((acc, r) => acc + r.monthlyAmountCents, 0);
  const yearlyTotalCents = activeItems.reduce(
    (acc, r) => acc + (r.frequency === 'yearly' ? (r.hasPriceHike ? r.lastAmountCents : r.amountCents) : r.monthlyAmountCents * 12),
    0,
  );
  const activeCount = activeItems.length;
  const priceHikesCount = activeItems.filter((r) => r.hasPriceHike).length;

  return {
    monthlyTotalCents,
    yearlyTotalCents,
    activeCount,
    priceHikesCount,
    items,
  };
}
