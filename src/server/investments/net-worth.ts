import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  assets,
  holdings,
  institutions,
  invoices,
  netWorthSnapshots,
  transactions,
} from '@/server/db/schema';
import { today } from '@/server/domain/dates';
import type { AssetClass } from '@/server/domain/enums';
import { txLive } from '@/server/ledger';

export type NetWorthComputation = {
  date: string;
  cashAccountsCents: number;
  investmentsCents: number;
  openInvoicesCents: number;
  futureInstallmentsCents: number;
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  breakdown: {
    byAssetClass: Partial<Record<AssetClass, number>>;
    byInstitution: Array<{
      institutionId: string;
      name: string;
      assetsCents: number;
      liabilitiesCents: number;
    }>;
  };
};

export async function computeNetWorth(
  db: Db,
  refDate?: string,
): Promise<NetWorthComputation> {
  const dateStr = refDate ?? today();

  // 1. Busca instituições e contas ativas (includeInTotals = true, isHidden = false)
  const [instRows, accRows] = await Promise.all([
    db.select().from(institutions),
    db
      .select()
      .from(accounts)
      .where(and(eq(accounts.includeInTotals, true), eq(accounts.isHidden, false))),
  ]);

  const accMap = new Map<string, (typeof accRows)[number]>();
  for (const acc of accRows) {
    accMap.set(acc.id, acc);
  }

  // 2. Saldos em contas de caixa ('checking', 'savings', 'wallet', 'benefit')
  const cashAccounts = accRows.filter((a) =>
    ['checking', 'savings', 'wallet', 'benefit'].includes(a.type),
  );
  const cashAccountsCents = cashAccounts.reduce((sum, a) => sum + a.balanceCents, 0);

  // 3. Investimentos: holdings ativas (isRedeemed = false) de contas incluídas
  const activeHoldings = await db
    .select({
      holding: holdings,
      asset: assets,
    })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.isRedeemed, false));

  const eligibleHoldings = activeHoldings.filter(({ holding }) =>
    accMap.has(holding.accountId),
  );

  let investmentsCents = 0;
  const byAssetClass: Partial<Record<AssetClass, number>> = {};
  const investmentHoldingAccountIds = new Set<string>();

  for (const { holding, asset } of eligibleHoldings) {
    investmentsCents += holding.currentValueCents;
    investmentHoldingAccountIds.add(holding.accountId);
    byAssetClass[asset.assetClass] =
      (byAssetClass[asset.assetClass] ?? 0) + holding.currentValueCents;
  }

  // Se houver contas type = 'investment' sem nenhuma holding ativa, soma o saldo delas
  const emptyInvestmentAccounts = accRows.filter(
    (a) => a.type === 'investment' && !investmentHoldingAccountIds.has(a.id),
  );
  for (const emptyAcc of emptyInvestmentAccounts) {
    const bal = Math.max(0, emptyAcc.balanceCents);
    investmentsCents += bal;
    if (bal > 0) {
      byAssetClass['other'] = (byAssetClass['other'] ?? 0) + bal;
    }
  }

  // 4. Faturas de cartão de crédito não pagas
  const cardAccounts = accRows.filter((a) => a.type === 'credit_card');
  const cardAccountIds = new Set(cardAccounts.map((a) => a.id));

  const unpaidInvoices = await db
    .select()
    .from(invoices)
    .where(ne(invoices.status, 'paid'));

  const eligibleInvoices = unpaidInvoices.filter((i) => cardAccountIds.has(i.accountId));

  const invoicesByAccount = new Map<string, typeof eligibleInvoices>();
  for (const inv of eligibleInvoices) {
    if (!invoicesByAccount.has(inv.accountId)) {
      invoicesByAccount.set(inv.accountId, []);
    }
    invoicesByAccount.get(inv.accountId)!.push(inv);
  }

  let openInvoicesCents = 0;
  // Mapa de fatura aberta atual (menor referenceMonth entre status 'open') por conta
  const currentOpenInvoiceByAccount = new Map<string, (typeof eligibleInvoices)[number]>();

  for (const cardAcc of cardAccounts) {
    const accInvs = invoicesByAccount.get(cardAcc.id) ?? [];
    const closedOrOverdue = accInvs
      .filter((i) => i.status === 'closed' || i.status === 'overdue')
      .reduce((sum, i) => sum + Math.max(0, i.totalCents), 0);

    const openInvs = accInvs
      .filter((i) => i.status === 'open')
      .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));

    const currentOpen = openInvs[0];
    if (currentOpen) {
      currentOpenInvoiceByAccount.set(cardAcc.id, currentOpen);
    }

    const currentOpenDebt = Math.max(0, currentOpen?.totalCents ?? 0);
    openInvoicesCents += closedOrOverdue + currentOpenDebt;
  }

  // 5. Parcelas futuras projetadas
  const invoiceMap = new Map<string, (typeof unpaidInvoices)[number]>();
  for (const inv of unpaidInvoices) {
    invoiceMap.set(inv.id, inv);
  }

  const projectedTxs = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.status, 'projected'),
        txLive,
      ),
    );

  let futureInstallmentsCents = 0;
  const futureInstallmentsByAccount = new Map<string, number>();

  for (const tx of projectedTxs) {
    if (!accMap.has(tx.accountId)) {
      continue;
    }

    const cardOpen = currentOpenInvoiceByAccount.get(tx.accountId);
    // Se a transação pertence à fatura aberta atual (já contada em openInvoicesCents), não conta de novo
    if (cardOpen && tx.invoiceId === cardOpen.id) {
      continue;
    }

    // Se pertence a uma fatura de cartão com referenceMonth <= cardOpen.referenceMonth, também ignora
    if (cardOpen && tx.invoiceId) {
      const inv = invoiceMap.get(tx.invoiceId);
      if (inv && inv.referenceMonth <= cardOpen.referenceMonth) {
        continue;
      }
    }

    const amount = Math.abs(tx.amountCents);
    futureInstallmentsCents += amount;
    futureInstallmentsByAccount.set(
      tx.accountId,
      (futureInstallmentsByAccount.get(tx.accountId) ?? 0) + amount,
    );
  }

  // 6. Totais consolidados
  const assetsCents = cashAccountsCents + investmentsCents;
  const liabilitiesCents = openInvoicesCents + futureInstallmentsCents;
  const netWorthCents = assetsCents - liabilitiesCents;

  // 7. Breakdown por Instituição
  const institutionMap = new Map<
    string,
    { institutionId: string; name: string; assetsCents: number; liabilitiesCents: number }
  >();

  for (const inst of instRows) {
    institutionMap.set(inst.id, {
      institutionId: inst.id,
      name: inst.name,
      assetsCents: 0,
      liabilitiesCents: 0,
    });
  }

  // Atribui contas de caixa
  for (const acc of cashAccounts) {
    const inst = institutionMap.get(acc.institutionId);
    if (inst) {
      inst.assetsCents += acc.balanceCents;
    }
  }

  // Atribui investimentos por holding
  for (const { holding } of eligibleHoldings) {
    const acc = accMap.get(holding.accountId);
    if (acc) {
      const inst = institutionMap.get(acc.institutionId);
      if (inst) {
        inst.assetsCents += holding.currentValueCents;
      }
    }
  }

  // Atribui investimentos vazios
  for (const emptyAcc of emptyInvestmentAccounts) {
    const inst = institutionMap.get(emptyAcc.institutionId);
    if (inst) {
      inst.assetsCents += Math.max(0, emptyAcc.balanceCents);
    }
  }

  // Atribui dívidas de cartão
  for (const cardAcc of cardAccounts) {
    const inst = institutionMap.get(cardAcc.institutionId);
    if (inst) {
      const accInvs = invoicesByAccount.get(cardAcc.id) ?? [];
      const closedOrOverdue = accInvs
        .filter((i) => i.status === 'closed' || i.status === 'overdue')
        .reduce((sum, i) => sum + Math.max(0, i.totalCents), 0);
      const currentOpen = currentOpenInvoiceByAccount.get(cardAcc.id);
      inst.liabilitiesCents += closedOrOverdue + Math.max(0, currentOpen?.totalCents ?? 0);
    }
  }

  // Atribui parcelas futuras
  for (const [accountId, amount] of futureInstallmentsByAccount.entries()) {
    const acc = accMap.get(accountId);
    if (acc) {
      const inst = institutionMap.get(acc.institutionId);
      if (inst) {
        inst.liabilitiesCents += amount;
      }
    }
  }

  // Filtra instituições que possuem contas ativas ou movimentação
  const activeInstIds = new Set(accRows.map((a) => a.institutionId));
  const byInstitution = Array.from(institutionMap.values()).filter(
    (inst) => activeInstIds.has(inst.institutionId),
  );

  return {
    date: dateStr,
    cashAccountsCents,
    investmentsCents,
    openInvoicesCents,
    futureInstallmentsCents,
    assetsCents,
    liabilitiesCents,
    netWorthCents,
    breakdown: {
      byAssetClass,
      byInstitution,
    },
  };
}

export async function captureNetWorthSnapshot(
  db: Db,
  refDate?: string,
): Promise<NetWorthComputation> {
  const result = await computeNetWorth(db, refDate);

  await db
    .insert(netWorthSnapshots)
    .values({
      date: result.date,
      cashAccountsCents: result.cashAccountsCents,
      investmentsCents: result.investmentsCents,
      openInvoicesCents: result.openInvoicesCents,
      futureInstallmentsCents: result.futureInstallmentsCents,
      assetsCents: result.assetsCents,
      liabilitiesCents: result.liabilitiesCents,
      netWorthCents: result.netWorthCents,
      breakdown: result.breakdown,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [netWorthSnapshots.date],
      set: {
        cashAccountsCents: result.cashAccountsCents,
        investmentsCents: result.investmentsCents,
        openInvoicesCents: result.openInvoicesCents,
        futureInstallmentsCents: result.futureInstallmentsCents,
        assetsCents: result.assetsCents,
        liabilitiesCents: result.liabilitiesCents,
        netWorthCents: result.netWorthCents,
        breakdown: result.breakdown,
        updatedAt: new Date(),
      },
    });

  return result;
}
