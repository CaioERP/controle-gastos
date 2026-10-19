import type { Db } from '@/server/db/client';
import { addMonthsISO, monthStart } from '@/server/domain/dates';
import type { InvoiceStatus } from '@/server/domain/enums';
import type { TxFilters } from '@/server/domain/filters';
import { getAccountsOverview, type InstitutionWithAccounts } from './accounts';
import type { BreakdownItem } from './breakdown';
import { getFutureInstallments } from './installments';
import { getSpendingSummary, type SpendingSummary } from './summary';

/** Variação relativa (atual − anterior) / anterior. Anterior 0 → null (a UI mostra "—"). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Intervalo da evolução mensal: 5 meses antes do início do filtro até o fim dele. */
export function trailingMonthsRange(f: Pick<TxFilters, 'from' | 'to'>, months: number): { from: string; to: string } {
  return { from: monthStart(addMonthsISO(monthStart(f.from), -(months - 1))), to: f.to };
}

export type TopItem = BreakdownItem & { isOthers: boolean };

/**
 * Top N linhas positivas + "Outras" (restante positivo + linhas negativas de estorno).
 * A soma dos itens retornados é sempre igual à soma da entrada, para que legenda e total batam.
 */
export function topWithOthers(items: BreakdownItem[], n: number, othersLabel = 'Outras'): TopItem[] {
  const positives = items.filter((i) => i.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents);
  const negatives = items.filter((i) => i.totalCents < 0);
  const top: TopItem[] = positives.slice(0, n).map((i) => ({ ...i, isOthers: false }));
  const rest = [...positives.slice(n), ...negatives];
  if (rest.length > 0) {
    top.push({
      key: 'outras',
      label: othersLabel,
      color: null,
      totalCents: rest.reduce((s, i) => s + i.totalCents, 0),
      count: rest.reduce((s, i) => s + i.count, 0),
      isOthers: true,
    });
  }
  return top;
}

export type UpcomingInvoice = {
  accountId: string;
  accountName: string;
  institutionName: string;
  institutionColor: string;
  invoiceId: string;
  dueDate: string;
  totalCents: number;
  status: InvoiceStatus;
};

export type AccountsSnapshot = {
  balanceCents: number;
  institutionCount: number;
  openInvoicesCents: number;
  cardCount: number;
  upcomingInvoices: UpcomingInvoice[];
};

type View = Pick<TxFilters, 'institutionIds' | 'accountIds'>;

/**
 * Situação atual das contas (independe do período), restrita à visão (instituição/conta).
 * - Sem visão ou por instituição: soma `totals.balanceCents` e `totals.cardDebtCents` (getAccountsOverview).
 * - Por conta: soma o saldo das contas escolhidas; para cartões, como a dívida por conta não é exposta,
 *   usa o total da fatura aberta (openInvoice).
 */
export function summarizeAccounts(overview: InstitutionWithAccounts[], view: View = {}): AccountsSnapshot {
  const instFilter = view.institutionIds?.length ? new Set(view.institutionIds) : null;
  const accFilter = view.accountIds?.length ? new Set(view.accountIds) : null;

  let balanceCents = 0;
  let openInvoicesCents = 0;
  let cardCount = 0;
  const institutionsWithBalance = new Set<string>();
  const upcomingInvoices: UpcomingInvoice[] = [];

  for (const inst of overview) {
    if (instFilter && !instFilter.has(inst.institution.id)) continue;
    const accs = accFilter ? inst.accounts.filter((a) => accFilter.has(a.id)) : inst.accounts;
    if (accs.length === 0) continue;

    if (accFilter) {
      for (const a of accs) {
        if (a.type === 'credit_card') openInvoicesCents += Math.max(0, a.credit?.openInvoice?.totalCents ?? 0);
        else balanceCents += a.balanceCents;
      }
    } else {
      balanceCents += inst.totals.balanceCents;
      openInvoicesCents += inst.totals.cardDebtCents;
    }

    for (const a of accs) {
      const counts = accFilter !== null || a.includeInTotals;
      if (a.type === 'credit_card') {
        if (counts) cardCount++;
        const inv = a.credit?.openInvoice;
        if (inv) {
          upcomingInvoices.push({
            accountId: a.id,
            accountName: a.displayName ?? a.name,
            institutionName: inst.institution.name,
            institutionColor: inst.institution.color,
            invoiceId: inv.id,
            dueDate: inv.dueDate,
            totalCents: inv.totalCents,
            status: inv.status,
          });
        }
      } else if (counts) {
        institutionsWithBalance.add(inst.institution.id);
      }
    }
  }

  upcomingInvoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.accountName.localeCompare(b.accountName));

  return {
    balanceCents,
    institutionCount: institutionsWithBalance.size,
    openInvoicesCents,
    cardCount,
    upcomingInvoices,
  };
}

export type DashboardKpis = SpendingSummary &
  AccountsSnapshot & {
    futureInstallmentsCents: number;
    futureInstallmentsCount: number;
    hasAccounts: boolean;
  };

/**
 * Todos os números dos cartões do topo do dashboard.
 * opts.today: data de referência (testes). opts.overview: resultado de getAccountsOverview já buscado pela página.
 */
export async function getDashboardKpis(
  db: Db,
  f: TxFilters,
  opts: { today?: string; overview?: InstitutionWithAccounts[] } = {}
): Promise<DashboardKpis> {
  const view: View = { institutionIds: f.institutionIds, accountIds: f.accountIds };
  const [summary, overview, installments] = await Promise.all([
    getSpendingSummary(db, f),
    opts.overview ?? getAccountsOverview(db, { today: opts.today }),
    getFutureInstallments(db, view, { today: opts.today }),
  ]);
  return {
    ...summary,
    ...summarizeAccounts(overview, view),
    futureInstallmentsCents: installments.reduce((s, m) => s + m.totalCents, 0),
    futureInstallmentsCount: installments.reduce((s, m) => s + m.count, 0),
    hasAccounts: overview.length > 0,
  };
}
