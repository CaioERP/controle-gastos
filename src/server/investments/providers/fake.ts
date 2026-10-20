import type {
  BenchmarkPoint,
  MarketDataProviders,
  QuoteResult,
  TreasuryQuoteResult,
} from './types';

export type FakeMarketDataOptions = {
  b3Quotes?: QuoteResult[] | ((tickers: string[]) => Promise<QuoteResult[]> | QuoteResult[]);
  treasuryQuotes?: TreasuryQuoteResult[] | (() => Promise<TreasuryQuoteResult[]> | TreasuryQuoteResult[]);
  cryptoQuotes?: QuoteResult[] | ((coinIds: string[]) => Promise<QuoteResult[]> | QuoteResult[]);
  benchmarkPoints?:
    | BenchmarkPoint[]
    | ((
        benchmark: string,
        from: string,
        to: string,
      ) => Promise<BenchmarkPoint[]> | BenchmarkPoint[]);
};

export function createFakeMarketDataProviders(
  options: FakeMarketDataOptions = {},
): MarketDataProviders {
  return {
    async fetchB3Quotes(tickers: string[]): Promise<QuoteResult[]> {
      if (typeof options.b3Quotes === 'function') {
        return options.b3Quotes(tickers);
      }
      if (options.b3Quotes) {
        const set = new Set(tickers.map((t) => t.toUpperCase()));
        return options.b3Quotes.filter((q) => set.has(q.ticker.toUpperCase()));
      }
      return [];
    },

    async fetchTreasuryQuotes(): Promise<TreasuryQuoteResult[]> {
      if (typeof options.treasuryQuotes === 'function') {
        return options.treasuryQuotes();
      }
      return options.treasuryQuotes ?? [];
    },

    async fetchCryptoQuotes(coinIds: string[]): Promise<QuoteResult[]> {
      if (typeof options.cryptoQuotes === 'function') {
        return options.cryptoQuotes(coinIds);
      }
      if (options.cryptoQuotes) {
        const set = new Set(coinIds.map((c) => c.toLowerCase()));
        return options.cryptoQuotes.filter((q) => set.has(q.ticker.toLowerCase()));
      }
      return [];
    },

    async fetchBenchmarkSeries(
      benchmark,
      from,
      to,
    ): Promise<BenchmarkPoint[]> {
      if (typeof options.benchmarkPoints === 'function') {
        return options.benchmarkPoints(benchmark, from, to);
      }
      if (options.benchmarkPoints) {
        return options.benchmarkPoints.filter(
          (p) => p.benchmark === benchmark && p.date >= from && p.date <= to,
        );
      }
      return [];
    },
  };
}
