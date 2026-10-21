import type { BenchmarkCode } from '@/server/domain/enums';

export type QuoteResult = {
  ticker: string; // ex.: 'PETR4', 'HGLG11', 'bitcoin'
  priceCents: number; // inteiro positivo
  date: string; // YYYY-MM-DD
};

export type TreasuryQuoteResult = {
  titleType: string; // ex.: 'Tesouro Selic', 'Tesouro IPCA+'
  maturityDate: string; // YYYY-MM-DD
  puBaseCents: number; // PU Venda Manhã (ou PU Base) em centavos
  date: string; // Data Base YYYY-MM-DD
};

export type BenchmarkPoint = {
  benchmark: BenchmarkCode;
  date: string; // YYYY-MM-DD (IPCA sempre no dia 01: YYYY-MM-01)
  valueMicros: number; // CDI/Selic/IPCA: taxa % * 1_000_000; Ibov: pontos * 100
};

export interface MarketDataProviders {
  fetchB3Quotes(tickers: string[]): Promise<QuoteResult[]>;
  fetchTreasuryQuotes(): Promise<TreasuryQuoteResult[]>;
  fetchCryptoQuotes(coinIds: string[]): Promise<QuoteResult[]>;
  fetchBenchmarkSeries(
    benchmark: BenchmarkCode,
    from: string,
    to: string,
  ): Promise<BenchmarkPoint[]>;
}
