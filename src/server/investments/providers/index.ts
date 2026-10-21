import { fetchB3Quotes } from './brapi';
import { fetchBenchmarkSeries } from './bcb-sgs';
import { fetchCryptoQuotes } from './coingecko';
import { fetchTreasuryQuotes } from './tesouro';
import type { MarketDataProviders } from './types';

export * from './types';
export * from './brapi';
export * from './tesouro';
export * from './bcb-sgs';
export * from './coingecko';
export * from './fake';

export const defaultMarketDataProviders: MarketDataProviders = {
  fetchB3Quotes,
  fetchTreasuryQuotes,
  fetchCryptoQuotes,
  fetchBenchmarkSeries,
};
