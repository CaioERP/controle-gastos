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
  db: Db,
  input: UpsertManualHoldingInput,
): Promise<{ holdingId: string; assetId: string }> {
  void db;
  void input;
  throw new CommandError('VALIDATION', 'upsertManualHolding ainda não implementado (A3-04)');
}

export async function deleteManualHolding(
  db: Db,
  input: { holdingId: string },
): Promise<void> {
  void db;
  void input;
  throw new CommandError('VALIDATION', 'deleteManualHolding ainda não implementado (A3-04)');
}

export async function recordInvestmentTransaction(
  db: Db,
  input: RecordInvestmentTransactionInput,
): Promise<{ investmentTransactionId: string }> {
  void db;
  void input;
  throw new CommandError('VALIDATION', 'recordInvestmentTransaction ainda não implementado (A3-04)');
}

export async function deleteInvestmentTransaction(
  db: Db,
  input: { investmentTransactionId: string },
): Promise<void> {
  void db;
  void input;
  throw new CommandError('VALIDATION', 'deleteInvestmentTransaction ainda não implementado (A3-04)');
}

export async function refreshMarketPrices(
  db: Db,
): Promise<PriceUpdateStats> {
  void db;
  throw new CommandError('VALIDATION', 'refreshMarketPrices ainda não implementado (A3-02)');
}

export async function captureNetWorthSnapshot(
  db: Db,
  refDate?: string,
): Promise<NetWorthComputation> {
  void db;
  void refDate;
  throw new CommandError('VALIDATION', 'captureNetWorthSnapshot ainda não implementado (A3-03)');
}
