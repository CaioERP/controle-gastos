import { asc, eq, ne } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  cards,
  connections,
  institutions,
  invoices,
} from '@/server/db/schema';
import type { AccountType, ConnectionStatus, InvoiceStatus } from '@/server/domain/enums';
import { today } from '@/server/domain/dates';

export type InstitutionWithAccounts = {
  institution: { id: string; name: string; color: string; slug: string };
  totals: { balanceCents: number; cardDebtCents: number };
  accounts: Array<{
    id: string;
    name: string;
    displayName: string | null;
    type: AccountType;
    balanceCents: number;
    balanceUpdatedAt: Date | null;
    isHidden: boolean;
    includeInTotals: boolean;
    credit: null | {
      limitCents: number | null;
      availableCents: number | null;
      closingDay: number | null;
      dueDay: number | null;
      openInvoice: { id: string; totalCents: number; dueDate: string; status: InvoiceStatus } | null;
    };
    cards: Array<{ id: string; last4: string; isVirtual: boolean; isAdditional: boolean; brand: string | null }>;
    connection: { id: string; status: ConnectionStatus; lastSyncedAt: Date | null } | null;
  }>;
};

const ACCOUNT_TYPE_SORT_ORDER: Record<AccountType, number> = {
  checking: 1,
  savings: 2,
  credit_card: 3,
  investment: 4,
  wallet: 5,
  benefit: 6,
};

/**
 * Contas agrupadas por instituição.
 * - openInvoice: fatura não paga de vencimento mais próximo >= hoje (ou a vencida mais antiga).
 * - totals.cardDebtCents: faturas fechadas/vencidas ainda não pagas + a fatura aberta atual
 *   (a aberta de menor mês de referência). Parcelas de meses futuros não entram.
 * - opts.today: data de referência (padrão: hoje em São Paulo). Testes devem sempre informá-la.
 */
export async function getAccountsOverview(
  db: Db,
  opts: { includeHidden?: boolean; today?: string } = {}
): Promise<InstitutionWithAccounts[]> {
  const whereAccounts = opts.includeHidden ? undefined : eq(accounts.isHidden, false);

  const [instRows, accRows, cardRows, invRows] = await Promise.all([
    db.select().from(institutions).orderBy(asc(institutions.name)),
    db
      .select({
        id: accounts.id,
        institutionId: accounts.institutionId,
        name: accounts.name,
        displayName: accounts.displayName,
        type: accounts.type,
        balanceCents: accounts.balanceCents,
        balanceUpdatedAt: accounts.balanceUpdatedAt,
        isHidden: accounts.isHidden,
        includeInTotals: accounts.includeInTotals,
        creditLimitCents: accounts.creditLimitCents,
        availableLimitCents: accounts.availableLimitCents,
        closingDay: accounts.closingDay,
        dueDay: accounts.dueDay,
        connectionId: connections.id,
        connectionStatus: connections.status,
        connectionLastSyncedAt: connections.lastSyncedAt,
      })
      .from(accounts)
      .leftJoin(connections, eq(connections.id, accounts.connectionId))
      .where(whereAccounts),
    db.select().from(cards),
    db.select().from(invoices).where(ne(invoices.status, 'paid')),
  ]);

  // Agrupa cartões por accountId
  const cardsByAccount = new Map<string, typeof cardRows>();
  for (const c of cardRows) {
    if (!cardsByAccount.has(c.accountId)) cardsByAccount.set(c.accountId, []);
    cardsByAccount.get(c.accountId)!.push(c);
  }

  // Agrupa faturas abertas por accountId para descobrir openInvoice
  // Regra: fatura não paga de vencimento mais próximo >= hoje (ou a vencida mais antiga)
  const todayStr = opts.today ?? today();
  const invoicesByAccount = new Map<string, typeof invRows>();
  for (const inv of invRows) {
    if (!invoicesByAccount.has(inv.accountId)) invoicesByAccount.set(inv.accountId, []);
    invoicesByAccount.get(inv.accountId)!.push(inv);
  }

  function pickOpenInvoice(accountInvs: typeof invRows | undefined) {
    if (!accountInvs || accountInvs.length === 0) return null;
    const futureOrToday = accountInvs
      .filter((i) => i.dueDate >= todayStr)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (futureOrToday.length > 0) {
      const inv = futureOrToday[0]!;
      return { id: inv.id, totalCents: inv.totalCents, dueDate: inv.dueDate, status: inv.status };
    }

    // Se só tiver vencidas no passado, pega a mais antiga
    const overdue = [...accountInvs].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const inv = overdue[0]!;
    return { id: inv.id, totalCents: inv.totalCents, dueDate: inv.dueDate, status: inv.status };
  }

  function cardDebt(accountInvs: typeof invRows | undefined): number {
    if (!accountInvs || accountInvs.length === 0) return 0;
    const closedOrOverdue = accountInvs
      .filter((i) => i.status === 'closed' || i.status === 'overdue')
      .reduce((sum, i) => sum + Math.max(0, i.totalCents), 0);
    const currentOpen = accountInvs
      .filter((i) => i.status === 'open')
      .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth))[0];
    return closedOrOverdue + Math.max(0, currentOpen?.totalCents ?? 0);
  }

  // Agrupa contas por institutionId
  const accountsByInstitution = new Map<string, typeof accRows>();
  for (const a of accRows) {
    if (!accountsByInstitution.has(a.institutionId)) accountsByInstitution.set(a.institutionId, []);
    accountsByInstitution.get(a.institutionId)!.push(a);
  }

  const result: InstitutionWithAccounts[] = [];

  for (const inst of instRows) {
    const rawAccounts = accountsByInstitution.get(inst.id) ?? [];
    if (rawAccounts.length === 0) continue;

    // Ordena contas por tipo
    rawAccounts.sort((a, b) => {
      const orderA = ACCOUNT_TYPE_SORT_ORDER[a.type] ?? 99;
      const orderB = ACCOUNT_TYPE_SORT_ORDER[b.type] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name);
    });

    let totalBalanceCents = 0;
    let totalCardDebtCents = 0;

    const formattedAccounts = rawAccounts.map((a) => {
      const accCards = cardsByAccount.get(a.id) ?? [];
      const openInv = a.type === 'credit_card' ? pickOpenInvoice(invoicesByAccount.get(a.id)) : null;

      if (a.includeInTotals) {
        if (a.type !== 'credit_card') {
          totalBalanceCents += a.balanceCents;
        } else {
          totalCardDebtCents += cardDebt(invoicesByAccount.get(a.id));
        }
      }

      return {
        id: a.id,
        name: a.name,
        displayName: a.displayName,
        type: a.type,
        balanceCents: a.balanceCents,
        balanceUpdatedAt: a.balanceUpdatedAt,
        isHidden: a.isHidden,
        includeInTotals: a.includeInTotals,
        credit:
          a.type === 'credit_card'
            ? {
                limitCents: a.creditLimitCents,
                availableCents: a.availableLimitCents,
                closingDay: a.closingDay,
                dueDay: a.dueDay,
                openInvoice: openInv,
              }
            : null,
        cards: accCards.map((c) => ({
          id: c.id,
          last4: c.last4,
          isVirtual: c.isVirtual,
          isAdditional: c.isAdditional,
          brand: c.brand,
        })),
        connection: a.connectionId
          ? {
              id: a.connectionId,
              status: a.connectionStatus!,
              lastSyncedAt: a.connectionLastSyncedAt,
            }
          : null,
      };
    });

    result.push({
      institution: {
        id: inst.id,
        name: inst.name,
        color: inst.color,
        slug: inst.slug,
      },
      totals: {
        balanceCents: totalBalanceCents,
        cardDebtCents: totalCardDebtCents,
      },
      accounts: formattedAccounts,
    });
  }

  return result;
}
