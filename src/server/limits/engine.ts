import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfWeek,
} from 'date-fns';
import type { Db } from '@/server/db/client';
import {
  accounts,
  categories,
  connections,
  institutions,
  invoices,
  notificationPreferences,
  notifications,
  spendingLimitDispatches,
  spendingLimits,
  transactions,
} from '@/server/db/schema';
import { addDaysISO, formatDateBR, monthEnd, monthStart, today as getToday } from '@/server/domain/dates';
import type { LimitPeriod, NotificationType, PaymentMethod } from '@/server/domain/enums';
import { formatBRL } from '@/server/domain/money';
import { buildTxWhere, spendValue } from '@/server/queries/base';
import { notSplitParent } from '@/server/queries/split-filter';

export type LimitPeriodRange = {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  periodKey: string; // 'YYYY-MM', 'YYYY-Wnn', 'YYYY'
};

/**
 * Calcula intervalo [from, to] e periodKey no fuso de São Paulo.
 * - monthly: YYYY-MM-01 .. YYYY-MM-lastDay, periodKey: 'YYYY-MM'
 * - weekly: segunda a domingo, periodKey: 'YYYY-Wnn'
 * - yearly: YYYY-01-01 .. YYYY-12-31, periodKey: 'YYYY'
 */
export function getLimitPeriodRange(period: LimitPeriod, refDate: string = getToday()): LimitPeriodRange {
  if (period === 'monthly') {
    const from = monthStart(refDate);
    const to = monthEnd(from);
    return {
      from,
      to,
      periodKey: from.slice(0, 7),
    };
  }

  if (period === 'yearly') {
    const year = refDate.slice(0, 4);
    return {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      periodKey: year,
    };
  }

  // weekly (segunda a domingo)
  const d = parseISO(refDate);
  const s = startOfWeek(d, { weekStartsOn: 1 });
  const e = endOfWeek(d, { weekStartsOn: 1 });
  const from = format(s, 'yyyy-MM-dd');
  const to = format(e, 'yyyy-MM-dd');
  const year = getISOWeekYear(s);
  const week = String(getISOWeek(s)).padStart(2, '0');
  return {
    from,
    to,
    periodKey: `${year}-W${week}`,
  };
}

/**
 * Monta URL de ação para /transacoes com os filtros corretos do período e limite.
 */
export function buildLimitActionUrl(filters: {
  from: string;
  to: string;
  categoryId?: string | null;
  paymentMethod?: PaymentMethod | null;
  accountId?: string | null;
}): string {
  const sp = new URLSearchParams();
  if (filters.from && filters.to) {
    if (filters.from.endsWith('-01') && filters.to === monthEnd(filters.from)) {
      sp.set('mes', filters.from.slice(0, 7));
    } else {
      sp.set('de', filters.from);
      sp.set('ate', filters.to);
    }
  }
  if (filters.categoryId) {
    sp.set('cat', filters.categoryId);
  }
  if (filters.paymentMethod) {
    sp.set('forma', filters.paymentMethod);
  }
  if (filters.accountId) {
    sp.set('contas', filters.accountId);
  }
  const qs = sp.toString();
  return qs ? `/transacoes?${qs}` : '/transacoes';
}

/**
 * Soma o gasto efetivo de um limite no período.
 * Usa regime de competência (accrual), spendValue e herança de categorias filhas via buildTxWhere.
 */
export async function getLimitSpent(
  db: Db,
  limit: {
    categoryId?: string | null;
    paymentMethod?: PaymentMethod | null;
    accountId?: string | null;
  },
  dateRange: { from: string; to: string },
): Promise<number> {
  const where = buildTxWhere(
    {
      from: dateRange.from,
      to: dateRange.to,
      basis: 'accrual',
      categoryIds: limit.categoryId ? [limit.categoryId] : undefined,
      paymentMethods: limit.paymentMethod ? [limit.paymentMethod] : undefined,
      accountIds: limit.accountId ? [limit.accountId] : undefined,
    },
    { forTotals: true },
  );

  const [row] = await db
    .select({
      spentCents: sql<number>`coalesce(sum(${spendValue}), 0)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(invoices, eq(invoices.id, transactions.invoiceId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(where);

  return Number(row?.spentCents ?? 0);
}

/**
 * Avalia todos os limites de gasto ativos e dispara notificações idempotentes de limiar e ritmo.
 */
export async function evaluateLimitsEngine(
  db: Db,
  opts?: { today?: string },
): Promise<{ evaluatedLimits: number; newNotifications: number }> {
  const todayDate = opts?.today ?? getToday();

  // Preferências de notificação
  const prefs = await db.select().from(notificationPreferences);
  const prefsMap = new Map<NotificationType, boolean>();
  for (const p of prefs) {
    prefsMap.set(p.type, p.enabled);
  }

  const isTypeEnabled = (t: NotificationType): boolean => prefsMap.get(t) ?? true;

  const activeLimits = await db
    .select()
    .from(spendingLimits)
    .where(eq(spendingLimits.isActive, true));

  let newNotifications = 0;

  for (const limit of activeLimits) {
    const range = getLimitPeriodRange(limit.period, todayDate);
    const spentCents = await getLimitSpent(db, limit, range);

    const spentPercent =
      limit.amountCents > 0 ? Math.round((spentCents / limit.amountCents) * 100) : 100;

    // 1. Limiares de valor (ex.: 80%, 100%)
    const thresholds = [...(limit.thresholds ?? [80, 100])].sort((a, b) => a - b);
    for (const t of thresholds) {
      if (spentPercent >= t) {
        // Confere despacho existente
        const [existing] = await db
          .select({ id: spendingLimitDispatches.id })
          .from(spendingLimitDispatches)
          .where(
            and(
              eq(spendingLimitDispatches.limitId, limit.id),
              eq(spendingLimitDispatches.periodKey, range.periodKey),
              eq(spendingLimitDispatches.threshold, t),
            ),
          );

        if (!existing) {
          await db
            .insert(spendingLimitDispatches)
            .values({
              limitId: limit.id,
              periodKey: range.periodKey,
              threshold: t,
              dispatchedAt: new Date(),
            })
            .onConflictDoNothing();

          const notifType: NotificationType = t >= 100 ? 'threshold_100' : 'threshold_80';
          if (isTypeEnabled(notifType)) {
            const title =
              t >= 100
                ? `Limite atingido: ${limit.name}`
                : `Atenção ao limite: ${limit.name} (${t}%)`;
            const message = `Você gastou ${formatBRL(spentCents)} de ${formatBRL(limit.amountCents)} (${spentPercent}% do limite no período).`;
            const actionUrl = buildLimitActionUrl({
              from: range.from,
              to: range.to,
              categoryId: limit.categoryId,
              paymentMethod: limit.paymentMethod,
              accountId: limit.accountId,
            });
            const fingerprint = `limit:${limit.id}:${range.periodKey}:t:${t}`;

            const inserted = await db
              .insert(notifications)
              .values({
                type: notifType,
                title,
                message,
                actionUrl,
                entityType: 'spending_limit',
                entityId: limit.id,
                channel: 'in_app',
                fingerprint,
              })
              .onConflictDoNothing()
              .returning({ id: notifications.id });

            if (inserted.length > 0) {
              newNotifications++;
            }
          }
        }
      }
    }

    // 2. Alerta de ritmo (projeção linear)
    if (limit.notifyPace && spentPercent < 100 && spentCents > 0) {
      const D = differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1;
      const dRaw = differenceInCalendarDays(parseISO(todayDate), parseISO(range.from)) + 1;
      const d = Math.max(1, Math.min(D, dRaw));
      const p = d / D;

      if (p >= 0.25) {
        const projectedTotal = Math.round((spentCents / d) * D);
        if (projectedTotal > limit.amountCents) {
          const dEstouro = Math.ceil((limit.amountCents * d) / spentCents);
          if (dEstouro <= D) {
            const [existingPace] = await db
              .select({ id: spendingLimitDispatches.id })
              .from(spendingLimitDispatches)
              .where(
                and(
                  eq(spendingLimitDispatches.limitId, limit.id),
                  eq(spendingLimitDispatches.periodKey, range.periodKey),
                  eq(spendingLimitDispatches.threshold, -1),
                ),
              );

            if (!existingPace) {
              await db
                .insert(spendingLimitDispatches)
                .values({
                  limitId: limit.id,
                  periodKey: range.periodKey,
                  threshold: -1,
                  dispatchedAt: new Date(),
                })
                .onConflictDoNothing();

              if (isTypeEnabled('pace_warning')) {
                const burstDate = addDaysISO(range.from, dEstouro - 1);
                const daysRemaining = Math.max(1, dEstouro - d);
                const dailyRateCents = Math.round(spentCents / d);
                const title = `Ritmo acelerado em ${limit.name}`;
                const message = `No ritmo atual de ${formatBRL(dailyRateCents)}/dia, você deve atingir o limite em ${daysRemaining} dias (dia ${formatDateBR(burstDate)}).`;
                const actionUrl = buildLimitActionUrl({
                  from: range.from,
                  to: range.to,
                  categoryId: limit.categoryId,
                  paymentMethod: limit.paymentMethod,
                  accountId: limit.accountId,
                });
                const fingerprint = `limit:${limit.id}:${range.periodKey}:pace`;

                const inserted = await db
                  .insert(notifications)
                  .values({
                    type: 'pace_warning',
                    title,
                    message,
                    actionUrl,
                    entityType: 'spending_limit',
                    entityId: limit.id,
                    channel: 'in_app',
                    fingerprint,
                  })
                  .onConflictDoNothing()
                  .returning({ id: notifications.id });

                if (inserted.length > 0) {
                  newNotifications++;
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    evaluatedLimits: activeLimits.length,
    newNotifications,
  };
}

/**
 * Avalia alertas gerais do sistema:
 * - fatura vencendo em 3 dias (invoice_due_soon)
 * - consentimento expirando em 15 dias (consent_expiring)
 * - despesa recente fora do padrão (unusual_expense)
 */
export async function evaluateSystemAlerts(
  db: Db,
  opts?: { transactionIds?: string[]; today?: string },
): Promise<number> {
  const todayDate = opts?.today ?? getToday();

  const prefs = await db.select().from(notificationPreferences);
  const prefsMap = new Map<NotificationType, boolean>();
  for (const p of prefs) {
    prefsMap.set(p.type, p.enabled);
  }
  const isTypeEnabled = (t: NotificationType): boolean => prefsMap.get(t) ?? true;

  let newNotifications = 0;

  // 1. Fatura vencendo em 3 dias
  if (isTypeEnabled('invoice_due_soon')) {
    const targetDueDate = addDaysISO(todayDate, 3);
    const dueSoonInvoices = await db
      .select({
        id: invoices.id,
        dueDate: invoices.dueDate,
        totalCents: invoices.totalCents,
        accountId: invoices.accountId,
        accountName: accounts.name,
      })
      .from(invoices)
      .innerJoin(accounts, eq(accounts.id, invoices.accountId))
      .where(
        and(
          inArray(invoices.status, ['open', 'closed']),
          eq(invoices.dueDate, targetDueDate),
          sql`${invoices.totalCents} > 0`,
        ),
      );

    for (const inv of dueSoonInvoices) {
      const fingerprint = `invoice:${inv.id}:due-soon:${inv.dueDate}`;
      const title = `Fatura vencendo em breve: ${inv.accountName}`;
      const message = `A fatura no valor de ${formatBRL(inv.totalCents)} vence em 3 dias (${formatDateBR(inv.dueDate)}).`;
      const actionUrl = `/faturas`;

      const [created] = await db
        .insert(notifications)
        .values({
          type: 'invoice_due_soon',
          title,
          message,
          actionUrl,
          entityType: 'invoice',
          entityId: inv.id,
          channel: 'in_app',
          fingerprint,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });

      if (created) newNotifications++;
    }
  }

  // 2. Consentimento de conexão expirando em 15 dias
  if (isTypeEnabled('consent_expiring')) {
    const targetDate = addDaysISO(todayDate, 15);
    const expiringConns = await db
      .select({
        id: connections.id,
        consentExpiresAt: connections.consentExpiresAt,
        institutionName: institutions.name,
      })
      .from(connections)
      .leftJoin(institutions, eq(institutions.id, connections.institutionId))
      .where(
        and(
          eq(connections.status, 'active'),
          sql`${connections.consentExpiresAt} is not null`,
          sql`${connections.consentExpiresAt} >= ${todayDate}`,
          sql`${connections.consentExpiresAt} <= ${targetDate + 'T23:59:59.999Z'}`,
        ),
      );

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const conn of expiringConns) {
      // Dispara no máximo 1 vez a cada 7 dias por conexão
      const [recent] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.type, 'consent_expiring'),
            eq(notifications.entityId, conn.id),
            sql`${notifications.createdAt} >= ${sevenDaysAgo}`,
          ),
        );

      if (!recent) {
        const expiresAt = new Date(conn.consentExpiresAt!);
        const daysLeft = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
        const expiresDateStr = format(expiresAt, 'yyyy-MM-dd');
        const instLabel = conn.institutionName ?? 'Banco';
        const title = `Consentimento expirando: ${instLabel}`;
        const message = `Sua conexão com ${instLabel} expira em ${daysLeft} dias (${formatDateBR(expiresDateStr)}). Reconecte para manter a sincronização.`;
        const fingerprint = `conn:${conn.id}:expiring:${todayDate}`;

        const [created] = await db
          .insert(notifications)
          .values({
            type: 'consent_expiring',
            title,
            message,
            actionUrl: '/conexoes',
            entityType: 'connection',
            entityId: conn.id,
            channel: 'in_app',
            fingerprint,
          })
          .onConflictDoNothing()
          .returning({ id: notifications.id });

        if (created) newNotifications++;
      }
    }
  }

  // 3. Gasto fora do padrão (unusual_expense)
  if (isTypeEnabled('unusual_expense')) {
    // Transações elegíveis: despesa recente >= R$ 100 (amountCents <= -10000)
    const txConds = [
      eq(transactions.kind, 'expense'),
      isNull(transactions.deletedAt),
      notSplitParent,
      sql`${transactions.amountCents} <= -10000`,
      sql`${transactions.categoryId} is not null`,
    ];

    // A janela de 7 dias vale sempre: a primeira sincronização ou a importação de um extrato antigo
    // trazem meses de histórico, e só despesa recente deve virar aviso.
    const sinceDate = addDaysISO(todayDate, -7);
    txConds.push(sql`${transactions.date} >= ${sinceDate}`);
    txConds.push(sql`${transactions.date} <= ${todayDate}`);
    if (opts?.transactionIds && opts.transactionIds.length > 0) {
      txConds.push(inArray(transactions.id, opts.transactionIds));
    }

    const candidateTxs = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amountCents: transactions.amountCents,
        description: transactions.description,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(...txConds));

    for (const tx of candidateTxs) {
      if (!tx.categoryId) continue;

      const windowStart = addDaysISO(tx.date, -90);
      const pastExpenses = await db
        .select({
          amountCents: transactions.amountCents,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.categoryId, tx.categoryId),
            eq(transactions.kind, 'expense'),
            isNull(transactions.deletedAt),
            notSplitParent,
            sql`${transactions.date} >= ${windowStart}`,
            sql`${transactions.date} <= ${tx.date}`,
            sql`${transactions.id} <> ${tx.id}`,
          ),
        );

      if (pastExpenses.length >= 5) {
        const values = pastExpenses.map((p) => -p.amountCents);
        const sum = values.reduce((acc, v) => acc + v, 0);
        const mean = sum / values.length;
        const variance =
          values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        const currentExpense = -tx.amountCents;
        if (currentExpense > mean + 2 * stdDev) {
          const fingerprint = `tx:${tx.id}:unusual`;
          const title = `Gasto fora do padrão: ${tx.description}`;
          const catLabel = tx.categoryName ?? 'Categoria';
          const message = `A despesa de ${formatBRL(currentExpense)} é significativamente maior que a sua média em ${catLabel} (${formatBRL(Math.round(mean))}).`;
          const actionUrl = `/transacoes?q=${encodeURIComponent(tx.description)}`;

          const [created] = await db
            .insert(notifications)
            .values({
              type: 'unusual_expense',
              title,
              message,
              actionUrl,
              entityType: 'transaction',
              entityId: tx.id,
              channel: 'in_app',
              fingerprint,
            })
            .onConflictDoNothing()
            .returning({ id: notifications.id });

          if (created) newNotifications++;
        }
      }
    }
  }

  return newNotifications;
}
