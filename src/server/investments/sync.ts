import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  assetPrices,
  assets,
  connections,
  holdings,
  investmentTransactions,
  transactions,
} from '@/server/db/schema';
import { addDaysISO } from '@/server/domain/dates';
import type { PluggyApi } from '@/server/ingestion/pluggy/api';
import { resolveInstitution } from '@/server/ingestion/institutions';
import {
  normalizePluggyInvestment,
  normalizePluggyInvestmentTx,
} from './pluggy-normalize';

function daysBetween(a: string, b: string): number {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / 86_400_000);
}

export type LinkInvestmentOpts = {
  holdingIds: string[];
};

export async function linkInvestmentTransactionsToChecking(
  db: Db,
  opts: LinkInvestmentOpts,
): Promise<number> {
  if (opts.holdingIds.length === 0) return 0;

  const unlinkedTxs = await db
    .select({
      id: investmentTransactions.id,
      holdingId: investmentTransactions.holdingId,
      accountId: investmentTransactions.accountId,
      type: investmentTransactions.type,
      date: investmentTransactions.date,
      amountCents: investmentTransactions.amountCents,
      feeCents: investmentTransactions.feeCents,
      taxCents: investmentTransactions.taxCents,
      institutionId: accounts.institutionId,
    })
    .from(investmentTransactions)
    .innerJoin(accounts, eq(accounts.id, investmentTransactions.accountId))
    .where(
      and(
        inArray(investmentTransactions.holdingId, opts.holdingIds),
        inArray(investmentTransactions.type, ['buy', 'sell']),
        isNull(investmentTransactions.linkedTransactionId),
      ),
    );

  if (unlinkedTxs.length === 0) return 0;

  // Busca os IDs de transações da conta corrente que já foram vinculados
  const alreadyLinkedRows = await db
    .select({ id: investmentTransactions.linkedTransactionId })
    .from(investmentTransactions)
    .where(isNotNull(investmentTransactions.linkedTransactionId));

  const claimedTxIds = new Set<string>(
    alreadyLinkedRows.map((r) => r.id!).filter(Boolean),
  );

  let linkedCount = 0;

  for (const invTx of unlinkedTxs) {
    const minDate = addDaysISO(invTx.date, -3);
    const maxDate = addDaysISO(invTx.date, 3);

    // Candidatas em transactions (kind = 'investment', ativas, sem divisão mãe)
    const candidates = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amountCents: transactions.amountCents,
        institutionId: accounts.institutionId,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          eq(transactions.kind, 'investment'),
          isNull(transactions.deletedAt),
          isNull(transactions.parentTransactionId),
          gte(transactions.date, minDate),
          lte(transactions.date, maxDate),
        ),
      );

    // Filtra pelo valor financeiro e não reclamadas
    const validCandidates = candidates.filter((tx) => {
      if (claimedTxIds.has(tx.id)) return false;

      if (invTx.type === 'buy') {
        // Aporte / compra: saída da conta corrente (negativo)
        return tx.amountCents < 0 && Math.abs(Math.abs(tx.amountCents) - invTx.amountCents) <= 1;
      }
      if (invTx.type === 'sell') {
        // Resgate / venda: entrada na conta corrente (positivo)
        const allowedDiff = Math.max(1, invTx.taxCents + invTx.feeCents);
        return tx.amountCents > 0 && Math.abs(tx.amountCents - invTx.amountCents) <= allowedDiff;
      }
      return false;
    });

    if (validCandidates.length === 0) continue;

    // Prioriza: 1) Mesma instituição; 2) Menor diferença absoluta em dias; 3) Menor diferença de valor
    validCandidates.sort((a, b) => {
      const aSameInst = a.institutionId === invTx.institutionId ? 0 : 1;
      const bSameInst = b.institutionId === invTx.institutionId ? 0 : 1;
      if (aSameInst !== bSameInst) return aSameInst - bSameInst;

      const aDays = Math.abs(daysBetween(a.date, invTx.date));
      const bDays = Math.abs(daysBetween(b.date, invTx.date));
      if (aDays !== bDays) return aDays - bDays;

      const aDiff = Math.abs(Math.abs(a.amountCents) - invTx.amountCents);
      const bDiff = Math.abs(Math.abs(b.amountCents) - invTx.amountCents);
      return aDiff - bDiff;
    });

    const best = validCandidates[0];
    if (!best) continue;

    const second = validCandidates[1];
    const isUniqueBest =
      !second ||
      (best.institutionId === invTx.institutionId && second.institutionId !== invTx.institutionId) ||
      Math.abs(daysBetween(best.date, invTx.date)) < Math.abs(daysBetween(second.date, invTx.date));

    if (isUniqueBest) {
      await db
        .update(investmentTransactions)
        .set({ linkedTransactionId: best.id, updatedAt: new Date() })
        .where(eq(investmentTransactions.id, invTx.id));

      claimedTxIds.add(best.id);
      linkedCount++;
    }
  }

  return linkedCount;
}

export type SyncConnectionInvestmentsResult = {
  holdingsUpserted: number;
  txUpserted: number;
  linkedCount: number;
};

export async function syncConnectionInvestments(
  db: Db,
  connectionId: string,
  deps: { pluggy: PluggyApi; today?: string },
): Promise<SyncConnectionInvestmentsResult> {
  const [conn] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId));

  if (!conn) {
    return { holdingsUpserted: 0, txUpserted: 0, linkedCount: 0 };
  }

  const rawInvestments = await deps.pluggy.fetchInvestments(conn.externalId);
  if (!rawInvestments || rawInvestments.length === 0) {
    return { holdingsUpserted: 0, txUpserted: 0, linkedCount: 0 };
  }

  // Garante a existência de uma conta de investimento
  let invAccount: typeof accounts.$inferSelect;
  const [existingInvAccount] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.connectionId, conn.id), eq(accounts.type, 'investment')))
    .limit(1);

  if (!existingInvAccount) {
    let institutionId = conn.institutionId;

    if (!institutionId) {
      const [existing] = await db
        .select({ institutionId: accounts.institutionId })
        .from(accounts)
        .where(eq(accounts.connectionId, conn.id))
        .limit(1);
      institutionId = existing?.institutionId ?? null;
    }

    if (!institutionId) {
      const instName = rawInvestments[0]?.institution?.name || 'Investimentos';
      const inst = await resolveInstitution(db, instName);
      institutionId = inst.id;
    }

    const [created] = await db
      .insert(accounts)
      .values({
        institutionId,
        connectionId: conn.id,
        externalId: `inv:${conn.externalId}`,
        name: 'Investimentos',
        type: 'investment',
        currency: 'BRL',
        balanceCents: 0,
        includeInTotals: true,
      })
      .returning();

    if (!created) {
      throw new Error('Falha ao criar conta de investimentos');
    }
    invAccount = created;
  } else {
    invAccount = existingInvAccount;
  }

  const holdingIds: string[] = [];
  let holdingsUpserted = 0;
  let txUpserted = 0;

  for (const rawInv of rawInvestments) {
    const norm = normalizePluggyInvestment(rawInv);

    // Upsert do ativo
    const [existingAsset] = await db
      .select()
      .from(assets)
      .where(eq(assets.code, norm.asset.code))
      .limit(1);

    let assetId: string;
    if (!existingAsset) {
      const [newAsset] = await db
        .insert(assets)
        .values({ ...norm.asset })
        .returning({ id: assets.id });
      if (!newAsset) {
        throw new Error('Falha ao inserir ativo de investimento');
      }
      assetId = newAsset.id;
    } else {
      assetId = existingAsset.id;
      await db
        .update(assets)
        .set({
          ticker: norm.asset.ticker ?? existingAsset.ticker,
          isin: norm.asset.isin ?? existingAsset.isin,
          cnpj: norm.asset.cnpj ?? existingAsset.cnpj,
          name: norm.asset.name,
          assetClass: norm.asset.assetClass,
          currency: norm.asset.currency,
          issuer: norm.asset.issuer ?? existingAsset.issuer,
          indexer: norm.asset.indexer ?? existingAsset.indexer,
          rateBps: norm.asset.rateBps ?? existingAsset.rateBps,
          maturityDate: norm.asset.maturityDate ?? existingAsset.maturityDate,
          isTaxExempt: norm.asset.isTaxExempt,
          updatedAt: new Date(),
        })
        .where(eq(assets.id, existingAsset.id));
    }

    // Upsert da posição em holdings (respeitando R9 user_edited_fields)
    const [existingHolding] = await db
      .select()
      .from(holdings)
      .where(and(eq(holdings.source, 'pluggy'), eq(holdings.externalId, rawInv.id)))
      .limit(1);

    let holdingId: string;
    if (!existingHolding) {
      const [newHolding] = await db
        .insert(holdings)
        .values({
          accountId: invAccount.id,
          assetId,
          ...norm.holding,
        })
        .returning({ id: holdings.id });
      if (!newHolding) {
        throw new Error('Falha ao inserir holding');
      }
      holdingId = newHolding.id;
    } else {
      holdingId = existingHolding.id;
      const userEdited = new Set(existingHolding.userEditedFields ?? []);
      const patch: Partial<typeof holdings.$inferInsert> = {
        accountId: invAccount.id,
        assetId,
        asOfDate: norm.holding.asOfDate,
        isRedeemed: norm.holding.isRedeemed,
        raw: norm.holding.raw,
        updatedAt: new Date(),
      };

      if (!userEdited.has('quantity')) patch.quantity = norm.holding.quantity;
      if (!userEdited.has('averagePriceCents')) patch.averagePriceCents = norm.holding.averagePriceCents;
      if (!userEdited.has('investedCents')) patch.investedCents = norm.holding.investedCents;
      if (!userEdited.has('currentValueCents')) patch.currentValueCents = norm.holding.currentValueCents;
      if (!userEdited.has('netValueCents')) patch.netValueCents = norm.holding.netValueCents;
      if (!userEdited.has('profitCents')) patch.profitCents = norm.holding.profitCents;

      await db
        .update(holdings)
        .set(patch)
        .where(eq(holdings.id, existingHolding.id));
    }

    holdingIds.push(holdingId);
    holdingsUpserted++;

    // Se houver cotação unitária, grava em asset_prices
    if (norm.quotePriceCents != null && norm.quotePriceCents > 0) {
      await db
        .insert(assetPrices)
        .values({
          assetId,
          date: norm.holding.asOfDate,
          priceCents: norm.quotePriceCents,
          source: 'pluggy',
        })
        .onConflictDoUpdate({
          target: [assetPrices.assetId, assetPrices.date],
          set: { priceCents: norm.quotePriceCents, source: 'pluggy' },
        });
    }

    // Busca e sincroniza movimentações
    try {
      const rawTxs = await deps.pluggy.fetchInvestmentTransactions(rawInv.id);
      for (const rawTx of rawTxs) {
        const normTx = normalizePluggyInvestmentTx(rawTx);
        await db
          .insert(investmentTransactions)
          .values({
            holdingId,
            accountId: invAccount.id,
            ...normTx,
          })
          .onConflictDoUpdate({
            target: [investmentTransactions.source, investmentTransactions.externalId],
            set: {
              holdingId,
              accountId: invAccount.id,
              type: normTx.type,
              date: normTx.date,
              quantity: normTx.quantity,
              unitPriceCents: normTx.unitPriceCents,
              amountCents: normTx.amountCents,
              feeCents: normTx.feeCents,
              taxCents: normTx.taxCents,
              description: normTx.description,
              raw: normTx.raw,
              updatedAt: new Date(),
            },
          });
        txUpserted++;
      }
    } catch {
      // Ignora erro de transações de investimento individuais se falhar
    }
  }

  // Atualiza accounts.balanceCents da conta de investimento
  const [sumResult] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${holdings.currentValueCents}), 0)::bigint`,
    })
    .from(holdings)
    .where(and(eq(holdings.accountId, invAccount.id), eq(holdings.isRedeemed, false)));

  const newBalanceCents = Number(sumResult?.total ?? 0);
  await db
    .update(accounts)
    .set({
      balanceCents: newBalanceCents,
      balanceUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, invAccount.id));

  // Vincula movimentações com a conta corrente
  const linkedCount = await linkInvestmentTransactionsToChecking(db, { holdingIds });

  return {
    holdingsUpserted,
    txUpserted,
    linkedCount,
  };
}
