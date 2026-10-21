import { differenceInCalendarDays, parseISO } from 'date-fns';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  merchants,
  notificationPreferences,
  notifications,
  recurrences,
  transactions,
} from '@/server/db/schema';
import { addMonthsISO, today as getToday } from '@/server/domain/dates';
import type {
  NotificationType,
  PaymentMethod,
  RecurrenceFrequency,
} from '@/server/domain/enums';
import { formatBRL } from '@/server/domain/money';
import { normalizeForMatch, toDisplayCase } from '@/server/ingestion/strings';
import { notSplitParent } from '@/server/queries/split-filter';

export const KNOWN_SUBSCRIPTION_KEYWORDS = [
  'netflix',
  'spotify',
  'amazon prime',
  'prime video',
  'icloud',
  'apple.com/bill',
  'apple services',
  'apple',
  'google storage',
  'google one',
  'google play',
  'youtube',
  'disney',
  'star+',
  'hbo',
  'max',
  'deezer',
  'globo',
  'globoplay',
  'chatgpt',
  'openai',
  'anthropic',
  'claude',
  'github',
  'microsoft',
  'office 365',
  'adobe',
  'notion',
  'figma',
  'canva',
  'dropbox',
  'uber one',
  'smart fit',
  'gympass',
  'totalpass',
  'crunchyroll',
  'paramount',
];

export function isSubscriptionHeuristic(
  description: string,
  paymentMethod?: PaymentMethod | null,
): boolean {
  const norm = normalizeForMatch(description);
  const matchesKeyword = KNOWN_SUBSCRIPTION_KEYWORDS.some((kw) => norm.includes(kw));
  if (matchesKeyword) return true;

  if (paymentMethod === 'credit_card_single' || paymentMethod === 'direct_debit') {
    return true;
  }

  return false;
}

export type IntervalStats = {
  avgDays: number;
  stdDevDays: number;
  minInterval: number;
  maxInterval: number;
  frequency: RecurrenceFrequency | null;
  expectedDay: number | null;
};

/**
 * Calcula intervalos e determina se atendem aos critérios de regularidade:
 * - mensal: média de 26 a 34 dias com desvio padrão <= 4 dias OU mesmo dia do mês +- 3 dias
 * - semanal: média de 6 a 8 dias
 * - anual: média de 355 a 375 dias
 */
export function calculateIntervalStats(dates: string[]): IntervalStats {
  if (dates.length < 2) {
    return {
      avgDays: 0,
      stdDevDays: 0,
      minInterval: 0,
      maxInterval: 0,
      frequency: null,
      expectedDay: null,
    };
  }

  const sortedDates = [...dates].sort();
  const intervals: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const diff = differenceInCalendarDays(
      parseISO(sortedDates[i]!),
      parseISO(sortedDates[i - 1]!),
    );
    intervals.push(diff);
  }

  const K = intervals.length;
  const sum = intervals.reduce((acc, v) => acc + v, 0);
  const avgDays = sum / K;
  const variance =
    intervals.reduce((acc, v) => acc + Math.pow(v - avgDays, 2), 0) / K;
  const stdDevDays = Math.sqrt(variance);
  const minInterval = Math.min(...intervals);
  const maxInterval = Math.max(...intervals);

  // Análise de dia do mês para mensal
  const daysOfMonth = sortedDates.map((d) => parseISO(d).getDate());
  const avgDayOfMonth = Math.round(
    daysOfMonth.reduce((a, b) => a + b, 0) / daysOfMonth.length,
  );
  const sameDayOfMonthWithin3 = daysOfMonth.every(
    (d) => Math.abs(d - avgDayOfMonth) <= 3,
  );

  let frequency: RecurrenceFrequency | null = null;
  let expectedDay: number | null = null;

  // Critério Mensal
  if (
    avgDays >= 26 &&
    avgDays <= 34 &&
    minInterval >= 15 &&
    (stdDevDays <= 4 || sameDayOfMonthWithin3)
  ) {
    frequency = 'monthly';
    expectedDay = avgDayOfMonth;
  } else if (avgDays >= 6 && avgDays <= 8 && minInterval >= 3) {
    // Critério Semanal
    frequency = 'weekly';
    const lastDateParsed = parseISO(sortedDates[sortedDates.length - 1]!);
    // 1 (segunda) a 7 (domingo)
    const dayOfWeek = lastDateParsed.getDay() === 0 ? 7 : lastDateParsed.getDay();
    expectedDay = dayOfWeek;
  } else if (avgDays >= 355 && avgDays <= 375 && minInterval >= 300) {
    // Critério Anual
    frequency = 'yearly';
    expectedDay = avgDayOfMonth;
  }

  return {
    avgDays,
    stdDevDays,
    minInterval,
    maxInterval,
    frequency,
    expectedDay,
  };
}

export type AmountStats = {
  mean: number;
  stdDev: number;
  cv: number; // Coeficiente de variação: sigma / mu
  isStable: boolean; // CV <= 0.10
};

/**
 * Calcula estabilidade de valor.
 * Considera valores absolutos.
 * CV = sigma / mu <= 0.10 (+- 10%)
 */
export function calculateAmountStats(amounts: number[]): AmountStats {
  if (amounts.length === 0) {
    return { mean: 0, stdDev: 0, cv: 0, isStable: false };
  }

  const absAmounts = amounts.map((a) => Math.abs(a));
  const N = absAmounts.length;
  const sum = absAmounts.reduce((acc, v) => acc + v, 0);
  const mean = sum / N;

  if (mean === 0) {
    return { mean: 0, stdDev: 0, cv: 0, isStable: true };
  }

  const variance =
    absAmounts.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / N;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;
  const isStable = cv <= 0.1;

  return {
    mean: Math.round(mean),
    stdDev,
    cv,
    isStable,
  };
}

export type CandidateTx = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  merchantId: string | null;
  merchantName: string | null;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
};

export type DetectedCandidate = {
  merchantId: string | null;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  frequency: RecurrenceFrequency;
  expectedDay: number | null;
  amountCents: number;
  tolerancePercent: number;
  isSubscription: boolean;
  firstDate: string;
  lastDate: string;
  lastAmountCents: number;
};

/**
 * Avalia um grupo de transações de mesmo estabelecimento/descrição.
 * Retorna os dados da recorrência se cumprir todos os critérios (>= 3 ocorrências,
 * intervalo regular e valor estável), ou null se não cumprir.
 */
export function evaluateCandidateGroup(
  txs: CandidateTx[],
): DetectedCandidate | null {
  if (txs.length < 3) return null;

  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sorted.map((t) => t.date);
  const amounts = sorted.map((t) => t.amountCents);

  const intervalStats = calculateIntervalStats(dates);
  if (!intervalStats.frequency) {
    return null;
  }

  const amountStats = calculateAmountStats(amounts);
  if (!amountStats.isStable) {
    return null;
  }

  const lastTx = sorted[sorted.length - 1]!;
  const firstTx = sorted[0]!;

  // Nome legível: nome do estabelecimento ou Title Case da descrição
  const description =
    lastTx.merchantName || toDisplayCase(lastTx.description) || lastTx.description;

  // Categoria, conta e forma de pagamento mais frequentes
  const categoryFreq = new Map<string, number>();
  const accountFreq = new Map<string, number>();
  const methodFreq = new Map<string, number>();

  for (const t of sorted) {
    if (t.categoryId) {
      categoryFreq.set(t.categoryId, (categoryFreq.get(t.categoryId) ?? 0) + 1);
    }
    if (t.accountId) {
      accountFreq.set(t.accountId, (accountFreq.get(t.accountId) ?? 0) + 1);
    }
    if (t.paymentMethod) {
      methodFreq.set(t.paymentMethod, (methodFreq.get(t.paymentMethod) ?? 0) + 1);
    }
  }

  const pickMostFrequent = (map: Map<string, number>, fallback: string | null) => {
    let bestKey: string | null = fallback;
    let maxCount = 0;
    for (const [k, count] of map.entries()) {
      if (count > maxCount) {
        maxCount = count;
        bestKey = k;
      }
    }
    return bestKey;
  };

  const categoryId = pickMostFrequent(categoryFreq, lastTx.categoryId);
  const accountId = pickMostFrequent(accountFreq, lastTx.accountId);
  const paymentMethod = pickMostFrequent(
    methodFreq,
    lastTx.paymentMethod,
  ) as PaymentMethod | null;

  const isSubscription = isSubscriptionHeuristic(
    description,
    paymentMethod ?? lastTx.paymentMethod,
  );

  return {
    merchantId: lastTx.merchantId,
    description,
    categoryId,
    accountId,
    paymentMethod,
    frequency: intervalStats.frequency,
    expectedDay: intervalStats.expectedDay,
    amountCents: amountStats.mean,
    tolerancePercent: 10,
    isSubscription,
    firstDate: firstTx.date,
    lastDate: lastTx.date,
    lastAmountCents: Math.abs(lastTx.amountCents),
  };
}

export type DetectionResult = {
  detected: number;
  updated: number;
  priceHikes: number;
  cancelled: number;
};

/**
 * Varre o banco de dados dos últimos 12 meses, detecta recorrências e assinaturas,
 * atualiza a tabela `recurrences` e despacha alertas de aumento de preço ('price_hike')
 * e cancelamento/pausa ('cancelled_subscription').
 */
export async function runRecurrenceDetection(
  db: Db,
  opts?: { today?: string },
): Promise<DetectionResult> {
  const todayDate = opts?.today ?? getToday();
  const twelveMonthsAgo = addMonthsISO(todayDate, -12);

  // 1. Carrega preferências de notificação
  const prefs = await db.select().from(notificationPreferences);
  const prefsMap = new Map<NotificationType, boolean>();
  for (const p of prefs) {
    prefsMap.set(p.type, p.enabled);
  }
  const isTypeEnabled = (t: NotificationType): boolean => prefsMap.get(t) ?? true;

  // 2. Busca transações do tipo 'expense', não deletadas, excluindo filhas divididas, dos últimos 12 meses
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.description,
      merchantId: transactions.merchantId,
      merchantName: merchants.name,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      paymentMethod: transactions.paymentMethod,
    })
    .from(transactions)
    .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
    .where(
      and(
        eq(transactions.kind, 'expense'),
        ne(transactions.status, 'projected'),
        isNull(transactions.deletedAt),
        sql`${transactions.date} >= ${twelveMonthsAgo}`,
        sql`${transactions.date} <= ${todayDate}`,
        notSplitParent,
      ),
    );

  // 3. Agrupa por merchantId ou por descrição normalizada
  const groups = new Map<string, CandidateTx[]>();
  for (const row of rows) {
    const key = row.merchantId
      ? `m:${row.merchantId}`
      : `d:${normalizeForMatch(row.description)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  // 4. Carrega recorrências existentes
  const existingRecurrences = await db.select().from(recurrences);
  const existingByMerchant = new Map<string, typeof existingRecurrences[number]>();
  const existingByDesc = new Map<string, typeof existingRecurrences[number]>();

  for (const rec of existingRecurrences) {
    if (rec.merchantId) {
      existingByMerchant.set(rec.merchantId, rec);
    }
    existingByDesc.set(normalizeForMatch(rec.description), rec);
  }

  let detected = 0;
  let updated = 0;
  let priceHikes = 0;
  let cancelled = 0;

  // 5. Avalia cada grupo
  for (const group of groups.values()) {
    if (group.length < 3) continue;

    const candidate = evaluateCandidateGroup(group);
    if (!candidate) continue;

    // Procura recorrência já cadastrada
    const existing =
      (candidate.merchantId ? existingByMerchant.get(candidate.merchantId) : null) ??
      existingByDesc.get(normalizeForMatch(candidate.description));

    if (existing) {
      const latestAmount = candidate.lastAmountCents;
      const previousAmount = existing.lastAmountCents || existing.amountCents;

      // Detecção de aumento de preço (> 5% em relação a lastAmountCents / previousAmount)
      if (previousAmount > 0 && latestAmount > previousAmount * 1.05) {
        const percentual = Math.round(
          ((latestAmount - previousAmount) / previousAmount) * 100,
        );

        await db
          .update(recurrences)
          .set({
            lastAmountCents: latestAmount,
            lastDate: candidate.lastDate,
            updatedAt: new Date(),
          })
          .where(eq(recurrences.id, existing.id));

        if (isTypeEnabled('price_hike')) {
          const title = `Aumento detectado: ${existing.description}`;
          const message = `O valor subiu de ${formatBRL(existing.amountCents)} para ${formatBRL(latestAmount)} (+${percentual}%).`;
          const fingerprint = `recurrence:${existing.id}:hike:${candidate.lastDate}`;

          const inserted = await db
            .insert(notifications)
            .values({
              type: 'price_hike',
              title,
              message,
              actionUrl: '/assinaturas',
              entityType: 'recurrence',
              entityId: existing.id,
              channel: 'in_app',
              fingerprint,
            })
            .onConflictDoNothing()
            .returning({ id: notifications.id });

          if (inserted.length > 0) {
            priceHikes++;
          }
        }
      } else if (candidate.lastDate > existing.lastDate) {
        // Atualiza última data e último valor se for mais recente
        await db
          .update(recurrences)
          .set({
            lastDate: candidate.lastDate,
            lastAmountCents: latestAmount,
            updatedAt: new Date(),
          })
          .where(eq(recurrences.id, existing.id));
        updated++;
      }
    } else {
      // Insere nova recorrência detectada
      const [newRec] = await db
        .insert(recurrences)
        .values({
          merchantId: candidate.merchantId,
          description: candidate.description,
          categoryId: candidate.categoryId,
          accountId: candidate.accountId,
          paymentMethod: candidate.paymentMethod,
          frequency: candidate.frequency,
          expectedDay: candidate.expectedDay,
          amountCents: candidate.amountCents,
          tolerancePercent: candidate.tolerancePercent,
          status: 'active',
          isSubscription: candidate.isSubscription,
          firstDate: candidate.firstDate,
          lastDate: candidate.lastDate,
          lastAmountCents: candidate.lastAmountCents,
          autoDetected: true,
        })
        .returning();

      if (newRec) {
        detected++;
        if (newRec.merchantId) {
          existingByMerchant.set(newRec.merchantId, newRec);
        }
        existingByDesc.set(normalizeForMatch(newRec.description), newRec);
      }
    }
  }

  // 6. Detecção de cancelamento ou pausa (cobrança esperada atrasada em > 10 dias)
  const allActive = await db
    .select()
    .from(recurrences)
    .where(eq(recurrences.status, 'active'));

  const currentYearMonth = todayDate.slice(0, 7);

  for (const rec of allActive) {
    let expectedIntervalDays = 30;
    if (rec.frequency === 'weekly') {
      expectedIntervalDays = 7;
    } else if (rec.frequency === 'biweekly') {
      expectedIntervalDays = 14;
    } else if (rec.frequency === 'quarterly') {
      expectedIntervalDays = 90;
    } else if (rec.frequency === 'yearly') {
      expectedIntervalDays = 365;
    }

    const daysSinceLast = differenceInCalendarDays(
      parseISO(todayDate),
      parseISO(rec.lastDate),
    );

    if (daysSinceLast > expectedIntervalDays + 10) {
      if (isTypeEnabled('cancelled_subscription')) {
        const title = `Cobrança ausente: ${rec.description}`;
        const message = `Nenhuma cobrança de ${rec.description} foi identificada neste período. A assinatura foi cancelada ou pausada?`;
        const fingerprint = `recurrence:${rec.id}:missing:${currentYearMonth}`;

        const inserted = await db
          .insert(notifications)
          .values({
            type: 'cancelled_subscription',
            title,
            message,
            actionUrl: '/assinaturas',
            entityType: 'recurrence',
            entityId: rec.id,
            channel: 'in_app',
            fingerprint,
          })
          .onConflictDoNothing()
          .returning({ id: notifications.id });

        if (inserted.length > 0) {
          cancelled++;
        }
      }
    }
  }

  return {
    detected,
    updated,
    priceHikes,
    cancelled,
  };
}
