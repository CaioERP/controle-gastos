import { differenceInCalendarDays, parseISO } from 'date-fns';
import { desc } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { syncRuns } from '@/server/db/schema';
import { addDaysISO, today as getToday } from '@/server/domain/dates';
import type { ConnectionStatus } from '@/server/domain/enums';
import { getAccountsOverview, type InstitutionWithAccounts } from '@/server/queries/accounts';
import { listConnections } from '@/server/queries/connections';
import { summarizeAccounts } from '@/server/queries/dashboard';
import { getLimitsOverview } from '@/server/queries/limits';
import { getReviewCount } from '@/server/queries/transactions';

export type AttentionItem =
  | { kind: 'review'; count: number; href: '/revisao' }
  | {
      kind: 'invoice_due';
      invoiceId: string;
      accountName: string;
      institutionColor: string;
      dueDate: string;
      totalCents: number;
      daysLeft: number;
      href: string;
    }
  | {
      kind: 'connection';
      connectionId: string;
      institutionName: string;
      status: ConnectionStatus;
      href: string;
    }
  | {
      kind: 'limit';
      limitId: string;
      name: string;
      spentPercent: number;
      href: string;
    }
  | {
      kind: 'job_error';
      job: string;
      failedAt: string;
      href: '/conexoes';
    };

export async function getAttentionItems(
  db: Db,
  opts: { today?: string; now?: Date; overview?: InstitutionWithAccounts[] } = {},
): Promise<AttentionItem[]> {
  const todayStr = opts.today ?? getToday();
  const maxDue = addDaysISO(todayStr, 7);

  const [reviewCount, accountsOverview, connectionsList, limitsOverview, recentRuns] =
    await Promise.all([
      getReviewCount(db),
      opts.overview ?? getAccountsOverview(db, { today: todayStr }),
      listConnections(db),
      getLimitsOverview(db, todayStr, { withSuggestions: false }),
      // Só a execução mais recente de cada job (a tabela cresce a cada rodada do agendador)
      db
        .selectDistinctOn([syncRuns.job], {
          job: syncRuns.job,
          status: syncRuns.status,
          finishedAt: syncRuns.finishedAt,
          startedAt: syncRuns.startedAt,
        })
        .from(syncRuns)
        .orderBy(syncRuns.job, desc(syncRuns.startedAt)),
    ]);

  const items: AttentionItem[] = [];

  // 1. review: getReviewCount(db) > 0
  if (reviewCount > 0) {
    items.push({
      kind: 'review',
      count: reviewCount,
      href: '/revisao',
    });
  }

  // 2. invoice_due: summarizeAccounts(overview)
  // upcomingInvoices com status !== 'paid' e dueDate entre hoje e hoje + 7 dias (inclusive), ou já vencidas (status === 'overdue')
  // daysLeft = diferença em dias (negativo se vencida). href = /faturas?cartao=<accountId>
  const snapshot = summarizeAccounts(accountsOverview);
  for (const inv of snapshot.upcomingInvoices) {
    if (inv.status === 'paid') continue;

    const daysLeft = differenceInCalendarDays(
      parseISO(inv.dueDate),
      parseISO(todayStr),
    );
    const isDueSoon = inv.dueDate >= todayStr && inv.dueDate <= maxDue;
    const isOverdue = inv.status === 'overdue' || daysLeft < 0;

    if (isDueSoon || isOverdue) {
      items.push({
        kind: 'invoice_due',
        invoiceId: inv.invoiceId,
        accountName: inv.accountName,
        institutionColor: inv.institutionColor,
        dueDate: inv.dueDate,
        totalCents: inv.totalCents,
        daysLeft,
        href: `/faturas?cartao=${inv.accountId}`,
      });
    }
  }

  // 3. connection: listConnections(db) com status em ['error', 'expired', 'revoked']. href = /conexoes/<id>
  const problemStatuses = new Set<ConnectionStatus>(['error', 'expired', 'revoked']);
  for (const conn of connectionsList) {
    if (problemStatuses.has(conn.status)) {
      items.push({
        kind: 'connection',
        connectionId: conn.id,
        institutionName: conn.institution?.name ?? 'Instituição',
        status: conn.status,
        href: `/conexoes/${conn.id}`,
      });
    }
  }

  // 4. limit: metas ativas de getLimitsOverview (de qualquer tipo) com spentPercent >= 90. href = actionUrl da linha
  for (const lim of limitsOverview.limits) {
    if (lim.isActive && lim.spentPercent >= 90) {
      items.push({
        kind: 'limit',
        limitId: lim.id,
        name: lim.name,
        spentPercent: lim.spentPercent,
        href: lim.actionUrl,
      });
    }
  }

  // 5. job_error: execução mais recente de cada job em sync_runs que falhou nas últimas 48 h
  const latestByJob = new Map<string, (typeof recentRuns)[number]>();
  for (const run of recentRuns) {
    if (!latestByJob.has(run.job)) {
      latestByJob.set(run.job, run);
    }
  }

  const now = opts.now ?? new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  for (const [job, run] of latestByJob) {
    const failedDate = run.finishedAt ?? run.startedAt;
    if (run.status === 'error' && failedDate && failedDate >= fortyEightHoursAgo && failedDate <= now) {
      items.push({
        kind: 'job_error',
        job,
        failedAt: failedDate.toISOString(),
        href: '/conexoes',
      });
    }
  }

  return items;
}
