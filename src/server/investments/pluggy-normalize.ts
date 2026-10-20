import { toCents } from '@/server/domain/money';
import { today } from '@/server/domain/dates';
import type { AssetClass, InvestmentIndexer, InvestmentTxType } from '@/server/domain/enums';
import type { PluggyInvestment, PluggyInvestmentTransaction } from '@/server/ingestion/pluggy/api';
import { normalizeForMatch } from '@/server/ingestion/normalize/text';
import { fromScaledQty, toRateBps, toScaledQty } from './math';

export type NormalizedInvestmentAsset = {
  code: string;
  ticker: string | null;
  isin: string | null;
  cnpj: string | null;
  name: string;
  assetClass: AssetClass;
  currency: string;
  issuer: string | null;
  indexer: InvestmentIndexer | null;
  rateBps: number | null;
  maturityDate: string | null;
  isTaxExempt: boolean;
};

export type NormalizedInvestmentHolding = {
  source: 'pluggy';
  externalId: string;
  quantity: string;
  averagePriceCents: number | null;
  investedCents: number;
  currentValueCents: number;
  netValueCents: number | null;
  profitCents: number;
  asOfDate: string;
  isRedeemed: boolean;
  raw: unknown;
};

export type NormalizedPluggyInvestment = {
  asset: NormalizedInvestmentAsset;
  holding: NormalizedInvestmentHolding;
  quotePriceCents: number | null;
};

export type NormalizedInvestmentTransaction = {
  source: 'pluggy';
  externalId: string;
  type: InvestmentTxType;
  date: string;
  quantity: string | null;
  unitPriceCents: number | null;
  amountCents: number;
  feeCents: number;
  taxCents: number;
  description: string | null;
  raw: unknown;
};

export function mapAssetClass(inv: PluggyInvestment): AssetClass {
  const subtype = (inv.subtype ?? '').toUpperCase();
  const type = (inv.type ?? '').toUpperCase();

  if (subtype === 'TREASURY') {
    return 'treasury';
  }
  if (
    subtype === 'REAL_ESTATE_FUND' ||
    subtype === 'FI_INFRA' ||
    subtype === 'FI_AGRO'
  ) {
    return 'fii';
  }
  if (type === 'ETF' || subtype === 'ETF' || subtype === 'ETF_FUND') {
    return 'etf';
  }
  if (type === 'EQUITY' || subtype === 'STOCK' || subtype === 'BDR') {
    return 'stocks';
  }
  if (type === 'MUTUAL_FUND') {
    return 'funds';
  }
  if (type === 'SECURITY' || subtype === 'RETIREMENT') {
    return 'pension';
  }
  if (
    type === 'FIXED_INCOME' ||
    ['CDB', 'LCI', 'LCA', 'CRI', 'CRA', 'DEBENTURES', 'LC'].includes(subtype)
  ) {
    return 'fixed_income';
  }
  return 'other';
}

export function normalizePluggyInvestment(inv: PluggyInvestment): NormalizedPluggyInvestment {
  const assetClass = mapAssetClass(inv);
  const b3TickerRegex = /^[A-Z]{4}\d{1,2}$/i;

  let ticker: string | null = null;
  let code = `PLUGGY:${inv.id}`;
  let cnpj: string | null = null;

  if (assetClass === 'stocks' || assetClass === 'fii' || assetClass === 'etf') {
    const rawCode = (inv.code ?? '').trim();
    if (b3TickerRegex.test(rawCode)) {
      ticker = rawCode.toUpperCase();
      code = `B3:${ticker}`;
    }
  } else if (assetClass === 'treasury') {
    const dueDateStr = inv.dueDate ? inv.dueDate.slice(0, 10) : 'SEM-VENC';
    const normName = normalizeForMatch(inv.name).toUpperCase();
    code = `TESOURO:${normName}:${dueDateStr}`;
  } else if (assetClass === 'funds') {
    const digitsOnly = (inv.issuerCNPJ || inv.code || '').replace(/\D/g, '');
    if (digitsOnly.length === 14) {
      cnpj = digitsOnly;
      code = `CNPJ:${digitsOnly}`;
    }
  }

  // Indexer e Taxa
  let indexer: InvestmentIndexer | null = null;
  let rateBps: number | null = null;
  const rateTypeUpper = (inv.rateType ?? '').toUpperCase();

  if (rateTypeUpper.includes('CDI')) {
    indexer = 'cdi';
    rateBps = toRateBps(inv.rate ?? 100);
  } else if (rateTypeUpper.includes('IPCA')) {
    indexer = 'ipca';
    rateBps = toRateBps(inv.fixedAnnualRate ?? inv.rate ?? 0);
  } else if (rateTypeUpper.includes('SELIC')) {
    indexer = 'selic';
    rateBps = toRateBps(inv.rate ?? 100);
  } else if (inv.fixedAnnualRate != null && inv.fixedAnnualRate > 0) {
    indexer = 'prefixado';
    rateBps = toRateBps(inv.fixedAnnualRate);
  }

  const isTaxExempt =
    inv.taxExempt === true ||
    ['LCI', 'LCA', 'CRI', 'CRA'].includes((inv.subtype ?? '').toUpperCase());

  const currentValueCents = Math.max(0, toCents(inv.amount ?? inv.balance));
  const netValueCents = inv.amountWithdrawal != null || inv.balance != null
    ? toCents(inv.amountWithdrawal ?? inv.balance)
    : null;

  const investedCents = inv.amountOriginal != null
    ? Math.max(0, toCents(inv.amountOriginal))
    : Math.max(0, currentValueCents - (inv.amountProfit != null ? toCents(inv.amountProfit) : 0));

  const profitCents = currentValueCents - investedCents;
  const quantity = fromScaledQty(toScaledQty(inv.quantity ?? 1));

  const averagePriceCents = inv.value != null && inv.value > 0 ? toCents(inv.value) : null;
  const asOfDate = inv.date ? inv.date.slice(0, 10) : today();
  const isRedeemed = inv.status === 'TOTAL_WITHDRAWAL' || currentValueCents === 0;

  const quotePriceCents = inv.value != null && inv.value > 0 ? toCents(inv.value) : null;

  return {
    asset: {
      code,
      ticker,
      isin: inv.isin ?? null,
      cnpj: cnpj ?? (inv.issuerCNPJ ? inv.issuerCNPJ.replace(/\D/g, '') || null : null),
      name: inv.name,
      assetClass,
      currency: inv.currencyCode ?? 'BRL',
      issuer: inv.issuer ?? (inv.institution?.name ?? null),
      indexer,
      rateBps,
      maturityDate: inv.dueDate ? inv.dueDate.slice(0, 10) : null,
      isTaxExempt,
    },
    holding: {
      source: 'pluggy',
      externalId: inv.id,
      quantity,
      averagePriceCents,
      investedCents,
      currentValueCents,
      netValueCents,
      profitCents,
      asOfDate,
      isRedeemed,
      raw: inv,
    },
    quotePriceCents,
  };
}

export function normalizePluggyInvestmentTx(
  tx: PluggyInvestmentTransaction,
): NormalizedInvestmentTransaction {
  let type: InvestmentTxType;
  if (tx.type === 'BUY') {
    type = 'buy';
  } else if (tx.type === 'SELL') {
    type = 'sell';
  } else if (tx.type === 'TAX') {
    type = 'tax';
  } else if (tx.type === 'TRANSFER') {
    type = 'transfer';
  } else if (tx.movementType === 'DEBIT') {
    type = 'sell';
  } else {
    type = 'buy';
  }

  const amountCents = Math.abs(toCents(tx.amount ?? tx.netAmount ?? 0));
  const feeCents = toCents(tx.expenses?.brokerageFee ?? tx.expenses?.other ?? 0);
  const taxCents = toCents(tx.expenses?.incomeTax ?? 0);
  const unitPriceCents = tx.value != null && tx.value > 0 ? toCents(tx.value) : null;
  const quantity = tx.quantity != null ? fromScaledQty(toScaledQty(tx.quantity)) : null;
  const date = tx.date ? tx.date.slice(0, 10) : today();

  return {
    source: 'pluggy',
    externalId: tx.id,
    type,
    date,
    quantity,
    unitPriceCents,
    amountCents,
    feeCents,
    taxCents,
    description: tx.description ?? null,
    raw: tx,
  };
}
