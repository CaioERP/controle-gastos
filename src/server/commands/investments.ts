import type { Db } from '@/server/db/client';
import type { AssetClass, InvestmentIndexer, InvestmentTxType } from '@/server/domain/enums';
import { CommandError } from '@/server/domain/errors';

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

export type PriceUpdateStats = {
  b3Updated: number;
  treasuryUpdated: number;
  cryptoUpdated: number;
  benchmarksUpdated: number;
  holdingsRevalued: number;
  errors: string[];
};

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
    byInstitution: Array<{ institutionId: string; name: string; assetsCents: number; liabilitiesCents: number }>;
  };
};

export async function upsertManualHolding(
  _db: Db,
  _input: UpsertManualHoldingInput,
): Promise<{ holdingId: string; assetId: string }> {
  throw new CommandError('INTERNAL', 'upsertManualHolding ainda não implementado (A3-04)');
}

export async function deleteManualHolding(
  _db: Db,
  _input: { holdingId: string },
): Promise<void> {
  throw new CommandError('INTERNAL', 'deleteManualHolding ainda não implementado (A3-04)');
}

export async function recordInvestmentTransaction(
  _db: Db,
  _input: RecordInvestmentTransactionInput,
): Promise<{ investmentTransactionId: string }> {
  throw new CommandError('INTERNAL', 'recordInvestmentTransaction ainda não implementado (A3-04)');
}

export async function deleteInvestmentTransaction(
  _db: Db,
  _input: { investmentTransactionId: string },
): Promise<void> {
  throw new CommandError('INTERNAL', 'deleteInvestmentTransaction ainda não implementado (A3-04)');
}

export async function refreshMarketPrices(
  _db: Db,
): Promise<PriceUpdateStats> {
  throw new CommandError('INTERNAL', 'refreshMarketPrices ainda não implementado (A3-02)');
}

export async function captureNetWorthSnapshot(
  _db: Db,
  _refDate?: string,
): Promise<NetWorthComputation> {
  throw new CommandError('INTERNAL', 'captureNetWorthSnapshot ainda não implementado (A3-03)');
}
