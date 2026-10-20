import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import {
  accounts,
  assets,
  holdings,
  investmentTransactions,
} from '@/server/db/schema';
import { today } from '@/server/domain/dates';
import {
  ASSET_CLASSES,
  INVESTMENT_INDEXERS,
  INVESTMENT_TX_TYPES,
  type AssetClass,
  type InvestmentIndexer,
  type InvestmentTxType,
} from '@/server/domain/enums';
import { CommandError } from '@/server/domain/errors';
import { slugify } from '@/server/ingestion/institutions';
import { fromScaledQty, toScaledQty } from '@/server/investments/math';
import { linkInvestmentTransactionsToChecking } from '@/server/investments/sync';
import {
  captureNetWorthSnapshot as captureNetWorthSnapshotImpl,
  type NetWorthComputation,
} from '@/server/investments/net-worth';
import {
  updateMarketPricesAndBenchmarks,
  type PriceUpdateStats,
} from '@/server/investments/update-prices';

export type { PriceUpdateStats, NetWorthComputation };

const ZERO = BigInt(0);

export type UpsertManualHoldingInput = {
  holdingId?: string;
  accountId: string;
  assetClass: AssetClass;
  name: string;
  ticker?: string | null;
  indexer?: InvestmentIndexer | null;
  rateBps?: number | null;
  maturityDate?: string | null;
  isTaxExempt?: boolean;
  quantity: string;
  investedCents: number;
  currentValueCents: number;
  asOfDate?: string;
};

const upsertManualHoldingSchema = z.object({
  holdingId: z.string().uuid().optional(),
  accountId: z.string().uuid(),
  assetClass: z.enum(ASSET_CLASSES),
  name: z.string().trim().min(1).max(200),
  ticker: z.string().trim().max(20).nullable().optional(),
  indexer: z.enum(INVESTMENT_INDEXERS).nullable().optional(),
  rateBps: z.number().int().min(0).nullable().optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isTaxExempt: z.boolean().optional(),
  quantity: z.string().trim().min(1),
  investedCents: z.number().int().min(0),
  currentValueCents: z.number().int().min(0),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type RecordInvestmentTransactionInput = {
  holdingId: string;
  type: InvestmentTxType;
  date: string;
  amountCents: number;
  quantity?: string | null;
  unitPriceCents?: number | null;
  feeCents?: number;
  taxCents?: number;
  description?: string | null;
  linkedTransactionId?: string | null;
};

const recordInvestmentTransactionSchema = z.object({
  holdingId: z.string().uuid(),
  type: z.enum(INVESTMENT_TX_TYPES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCents: z.number().int().min(1),
  quantity: z.string().trim().nullable().optional(),
  unitPriceCents: z.number().int().min(0).nullable().optional(),
  feeCents: z.number().int().min(0).optional(),
  taxCents: z.number().int().min(0).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  linkedTransactionId: z.string().uuid().nullable().optional(),
});




async function updateInvestmentAccountBalance(db: Db, accountId: string): Promise<void> {
  const [sumResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${holdings.currentValueCents}), 0)::bigint` })
    .from(holdings)
    .where(and(eq(holdings.accountId, accountId), eq(holdings.isRedeemed, false)));

  const newBalance = Number(sumResult?.total ?? 0);
  await db
    .update(accounts)
    .set({ balanceCents: newBalance, balanceUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(accounts.id, accountId));
}

export async function upsertManualHolding(
  db: Db,
  input: UpsertManualHoldingInput,
): Promise<{ holdingId: string; assetId: string }> {
  const parsed = upsertManualHoldingSchema.safeParse(input);
  if (!parsed.success) {
    throw new CommandError('VALIDATION', parsed.error.issues[0]?.message ?? 'Entrada inválida');
  }
  const data = parsed.data;

  const scaledQty = toScaledQty(data.quantity);
  if (scaledQty <= ZERO) {
    throw new CommandError('VALIDATION', 'A quantidade deve ser maior que zero');
  }

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, data.accountId))
    .limit(1);

  if (!account) {
    throw new CommandError('NOT_FOUND', 'Conta de investimento não encontrada');
  }

  if (data.holdingId) {
    const [holding] = await db
      .select()
      .from(holdings)
      .where(eq(holdings.id, data.holdingId))
      .limit(1);

    if (!holding) {
      throw new CommandError('NOT_FOUND', 'Posição não encontrada');
    }

    if (holding.source !== 'manual') {
      // Posição sincronizada: permite editar campos gravando em userEditedFields (R9)
      const currentEdited = new Set(holding.userEditedFields ?? []);
      if (holding.currentValueCents !== data.currentValueCents) {
        currentEdited.add('currentValueCents');
      }
      if (holding.investedCents !== data.investedCents) {
        currentEdited.add('investedCents');
      }
      if (holding.quantity !== fromScaledQty(scaledQty)) {
        currentEdited.add('quantity');
      }

      await db
        .update(holdings)
        .set({
          currentValueCents: data.currentValueCents,
          investedCents: data.investedCents,
          quantity: fromScaledQty(scaledQty),
          profitCents: data.currentValueCents - data.investedCents,
          userEditedFields: Array.from(currentEdited),
          updatedAt: new Date(),
        })
        .where(eq(holdings.id, holding.id));

      if (account.type === 'investment') {
        await updateInvestmentAccountBalance(db, account.id);
      }

      return { holdingId: holding.id, assetId: holding.assetId };
    }

    // Posição manual: atualiza ativo e posição
    await db
      .update(assets)
      .set({
        name: data.name,
        ticker: data.ticker ? data.ticker.toUpperCase() : null,
        assetClass: data.assetClass,
        indexer: data.indexer ?? null,
        rateBps: data.rateBps ?? null,
        maturityDate: data.maturityDate ?? null,
        isTaxExempt: data.isTaxExempt ?? false,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, holding.assetId));

    const avgPrice =
      scaledQty > ZERO ? Math.round((data.investedCents * 1e8) / Number(scaledQty)) : null;

    await db
      .update(holdings)
      .set({
        quantity: fromScaledQty(scaledQty),
        investedCents: data.investedCents,
        currentValueCents: data.currentValueCents,
        profitCents: data.currentValueCents - data.investedCents,
        averagePriceCents: avgPrice,
        asOfDate: data.asOfDate ?? today(),
        updatedAt: new Date(),
      })
      .where(eq(holdings.id, holding.id));

    if (account.type === 'investment') {
      await updateInvestmentAccountBalance(db, account.id);
    }

    return { holdingId: holding.id, assetId: holding.assetId };
  }

  // Criação de nova posição manual
  let code: string;
  const ticker = data.ticker?.trim();
  if (ticker) {
    if (data.assetClass === 'crypto') {
      code = `CRYPTO:${ticker.toLowerCase()}`;
    } else {
      code = `B3:${ticker.toUpperCase()}`;
    }
  } else {
    const slug = slugify(data.name) || 'ativo';
    code = `MANUAL:${slug}-${randomUUID().slice(0, 8)}`;
  }

  const [existingAsset] = await db
    .select()
    .from(assets)
    .where(eq(assets.code, code))
    .limit(1);

  let assetId: string;
  if (existingAsset) {
    assetId = existingAsset.id;
    await db
      .update(assets)
      .set({
        name: data.name,
        ticker: ticker
          ? data.assetClass === 'crypto'
            ? ticker.toLowerCase()
            : ticker.toUpperCase()
          : existingAsset.ticker,
        assetClass: data.assetClass,
        indexer: data.indexer ?? existingAsset.indexer,
        rateBps: data.rateBps ?? existingAsset.rateBps,
        maturityDate: data.maturityDate ?? existingAsset.maturityDate,
        isTaxExempt: data.isTaxExempt ?? existingAsset.isTaxExempt,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, existingAsset.id));
  } else {
    const [insertedAsset] = await db
      .insert(assets)
      .values({
        code,
        ticker: ticker
          ? data.assetClass === 'crypto'
            ? ticker.toLowerCase()
            : ticker.toUpperCase()
          : null,
        name: data.name,
        assetClass: data.assetClass,
        indexer: data.indexer ?? null,
        rateBps: data.rateBps ?? null,
        maturityDate: data.maturityDate ?? null,
        isTaxExempt: data.isTaxExempt ?? false,
      })
      .returning({ id: assets.id });

    if (!insertedAsset) {
      throw new CommandError('VALIDATION', 'Falha ao cadastrar ativo');
    }
    assetId = insertedAsset.id;
  }

  const avgPrice =
    scaledQty > ZERO ? Math.round((data.investedCents * 1e8) / Number(scaledQty)) : null;

  const [insertedHolding] = await db
    .insert(holdings)
    .values({
      accountId: account.id,
      assetId,
      source: 'manual',
      externalId: `manual:${randomUUID()}`,
      quantity: fromScaledQty(scaledQty),
      averagePriceCents: avgPrice,
      investedCents: data.investedCents,
      currentValueCents: data.currentValueCents,
      profitCents: data.currentValueCents - data.investedCents,
      asOfDate: data.asOfDate ?? today(),
      isRedeemed: false,
    })
    .returning({ id: holdings.id });

  if (!insertedHolding) {
    throw new CommandError('VALIDATION', 'Falha ao cadastrar posição');
  }

  if (account.type === 'investment') {
    await updateInvestmentAccountBalance(db, account.id);
  }

  return { holdingId: insertedHolding.id, assetId };
}

export async function createManualHolding(
  db: Db,
  input: Omit<UpsertManualHoldingInput, 'holdingId'>,
): Promise<{ holdingId: string; assetId: string }> {
  return upsertManualHolding(db, input);
}

export async function updateManualHolding(
  db: Db,
  input: UpsertManualHoldingInput & { holdingId: string },
): Promise<{ holdingId: string; assetId: string }> {
  return upsertManualHolding(db, input);
}

export async function deleteManualHolding(
  db: Db,
  input: { holdingId: string },
): Promise<void> {
  const [holding] = await db
    .select()
    .from(holdings)
    .where(eq(holdings.id, input.holdingId))
    .limit(1);

  if (!holding) {
    throw new CommandError('NOT_FOUND', 'Posição não encontrada');
  }

  if (holding.source !== 'manual') {
    throw new CommandError(
      'VALIDATION',
      'Posições sincronizadas via Open Finance não podem ser excluídas manualmente',
    );
  }

  await db.delete(holdings).where(eq(holdings.id, holding.id));

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, holding.accountId))
    .limit(1);

  if (account && account.type === 'investment') {
    await updateInvestmentAccountBalance(db, account.id);
  }
}

export async function recordInvestmentTransaction(
  db: Db,
  input: RecordInvestmentTransactionInput,
): Promise<{ investmentTransactionId: string }> {
  const parsed = recordInvestmentTransactionSchema.safeParse(input);
  if (!parsed.success) {
    throw new CommandError('VALIDATION', parsed.error.issues[0]?.message ?? 'Entrada inválida');
  }
  const data = parsed.data;

  const [holding] = await db
    .select()
    .from(holdings)
    .where(eq(holdings.id, data.holdingId))
    .limit(1);

  if (!holding) {
    throw new CommandError('NOT_FOUND', 'Posição não encontrada');
  }

  const txScaledQty = data.quantity ? toScaledQty(data.quantity) : null;

  const [insertedTx] = await db
    .insert(investmentTransactions)
    .values({
      holdingId: holding.id,
      accountId: holding.accountId,
      source: 'manual',
      externalId: `manual:${randomUUID()}`,
      type: data.type,
      date: data.date,
      amountCents: data.amountCents,
      quantity: txScaledQty !== null ? fromScaledQty(txScaledQty) : null,
      unitPriceCents: data.unitPriceCents ?? null,
      feeCents: data.feeCents ?? 0,
      taxCents: data.taxCents ?? 0,
      description: data.description ?? null,
      linkedTransactionId: data.linkedTransactionId ?? null,
    })
    .returning({ id: investmentTransactions.id });

  if (!insertedTx) {
    throw new CommandError('VALIDATION', 'Falha ao registrar movimentação');
  }

  // Se a posição for manual, ajusta saldo e quantidade
  if (holding.source === 'manual') {
    const currentQty = toScaledQty(holding.quantity);

    if (data.type === 'buy') {
      const newQty = txScaledQty !== null ? currentQty + txScaledQty : currentQty;
      const newInvested = holding.investedCents + data.amountCents;
      const newCurrentValue = holding.currentValueCents + data.amountCents;
      const avgPrice =
        newQty > ZERO ? Math.round((newInvested * 1e8) / Number(newQty)) : holding.averagePriceCents;

      await db
        .update(holdings)
        .set({
          quantity: fromScaledQty(newQty),
          investedCents: newInvested,
          currentValueCents: newCurrentValue,
          profitCents: newCurrentValue - newInvested,
          averagePriceCents: avgPrice,
          isRedeemed: false,
          updatedAt: new Date(),
        })
        .where(eq(holdings.id, holding.id));
    } else if (data.type === 'sell') {
      if (txScaledQty !== null) {
        if (currentQty < txScaledQty) {
          throw new CommandError('VALIDATION', 'Quantidade a resgatar maior que a custodiada');
        }
        const newQty = currentQty - txScaledQty;
        const fraction = currentQty > ZERO ? Number(txScaledQty) / Number(currentQty) : 1;
        const costSold = Math.round(holding.investedCents * fraction);
        const newInvested = Math.max(0, holding.investedCents - costSold);
        const newCurrentValue = Math.max(0, holding.currentValueCents - data.amountCents);
        const isRedeemed = newQty === ZERO;

        await db
          .update(holdings)
          .set({
            quantity: fromScaledQty(newQty),
            investedCents: newInvested,
            currentValueCents: newCurrentValue,
            profitCents: newCurrentValue - newInvested,
            isRedeemed,
            updatedAt: new Date(),
          })
          .where(eq(holdings.id, holding.id));
      } else {
        const newInvested = Math.max(0, holding.investedCents - data.amountCents);
        const newCurrentValue = Math.max(0, holding.currentValueCents - data.amountCents);
        const isRedeemed = newCurrentValue === 0;

        await db
          .update(holdings)
          .set({
            investedCents: newInvested,
            currentValueCents: newCurrentValue,
            profitCents: newCurrentValue - newInvested,
            isRedeemed,
            updatedAt: new Date(),
          })
          .where(eq(holdings.id, holding.id));
      }
    }

    // Proventos ('income') não alteram quantity nem investedCents da posição

    await updateInvestmentAccountBalance(db, holding.accountId);
  }

  // Tenta vincular aporte ou resgate com transação da conta corrente
  if (!data.linkedTransactionId && (data.type === 'buy' || data.type === 'sell')) {
    await linkInvestmentTransactionsToChecking(db, { holdingIds: [holding.id] });
  }

  return { investmentTransactionId: insertedTx.id };
}

export async function recordIncomeTransaction(
  db: Db,
  input: Omit<RecordInvestmentTransactionInput, 'type'>,
): Promise<{ investmentTransactionId: string }> {
  return recordInvestmentTransaction(db, { ...input, type: 'income' });
}

export async function deleteInvestmentTransaction(
  db: Db,
  input: { investmentTransactionId: string },
): Promise<void> {
  const [tx] = await db
    .select()
    .from(investmentTransactions)
    .where(eq(investmentTransactions.id, input.investmentTransactionId))
    .limit(1);

  if (!tx) {
    throw new CommandError('NOT_FOUND', 'Movimentação não encontrada');
  }

  if (tx.source !== 'manual') {
    throw new CommandError(
      'VALIDATION',
      'Movimentações sincronizadas via Open Finance não podem ser excluídas manualmente',
    );
  }

  const [holding] = await db
    .select()
    .from(holdings)
    .where(eq(holdings.id, tx.holdingId))
    .limit(1);

  if (holding && holding.source === 'manual') {
    const currentQty = toScaledQty(holding.quantity);
    const txQty = tx.quantity ? toScaledQty(tx.quantity) : ZERO;

    if (tx.type === 'buy') {
      const newQty = currentQty >= txQty ? currentQty - txQty : ZERO;
      const newInvested = Math.max(0, holding.investedCents - tx.amountCents);
      const newCurrentValue = Math.max(0, holding.currentValueCents - tx.amountCents);
      const avgPrice =
        newQty > ZERO ? Math.round((newInvested * 1e8) / Number(newQty)) : null;

      await db
        .update(holdings)
        .set({
          quantity: fromScaledQty(newQty),
          investedCents: newInvested,
          currentValueCents: newCurrentValue,
          profitCents: newCurrentValue - newInvested,
          averagePriceCents: avgPrice,
          updatedAt: new Date(),
        })
        .where(eq(holdings.id, holding.id));
    } else if (tx.type === 'sell') {
      const newQty = currentQty + txQty;
      const newCurrentValue = holding.currentValueCents + tx.amountCents;
      const newInvested = holding.investedCents + tx.amountCents;

      await db
        .update(holdings)
        .set({
          quantity: fromScaledQty(newQty),
          investedCents: newInvested,
          currentValueCents: newCurrentValue,
          profitCents: newCurrentValue - newInvested,
          isRedeemed: false,
          updatedAt: new Date(),
        })
        .where(eq(holdings.id, holding.id));
    }

    await updateInvestmentAccountBalance(db, holding.accountId);
  }

  await db.delete(investmentTransactions).where(eq(investmentTransactions.id, tx.id));
}

export async function refreshMarketPrices(
  db: Db,
): Promise<PriceUpdateStats> {
  return updateMarketPricesAndBenchmarks(db);
}

export async function captureNetWorthSnapshot(
  db: Db,
  refDate?: string,
): Promise<NetWorthComputation> {
  return captureNetWorthSnapshotImpl(db, refDate);
}
