import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  assetPrices,
  assets,
  benchmarkSeries,
  holdings,
} from '@/server/db/schema';
import { addDaysISO, today } from '@/server/domain/dates';
import { BENCHMARK_CODES } from '@/server/domain/enums';
import { normalizeForMatch } from '@/server/ingestion/normalize/text';
import { multiplyQtyByPriceCents, toScaledQty } from './math';
import { defaultMarketDataProviders } from './providers';
import type { MarketDataProviders, QuoteResult } from './providers/types';

export type PriceUpdateStats = {
  b3Updated: number;
  treasuryUpdated: number;
  cryptoUpdated: number;
  benchmarksUpdated: number;
  holdingsRevalued: number;
  errors: string[];
};

const CRYPTO_SYMBOL_MAP: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  usdt: 'tether',
  usdc: 'usd-coin',
};

export async function updateMarketPricesAndBenchmarks(
  db: Db,
  deps?: { providers?: MarketDataProviders; today?: string },
): Promise<PriceUpdateStats> {
  const providers = deps?.providers ?? defaultMarketDataProviders;
  const todayStr = deps?.today ?? today();

  const stats: PriceUpdateStats = {
    b3Updated: 0,
    treasuryUpdated: 0,
    cryptoUpdated: 0,
    benchmarksUpdated: 0,
    holdingsRevalued: 0,
    errors: [],
  };

  // 1. Busca todas as holdings ativas e seus respectivos ativos
  const activeHoldings = await db
    .select({
      holding: holdings,
      asset: assets,
    })
    .from(holdings)
    .innerJoin(assets, eq(holdings.assetId, assets.id))
    .where(eq(holdings.isRedeemed, false));

  // Mapa de ativos únicos ativos
  const activeAssetsMap = new Map<string, typeof assets.$inferSelect>();
  for (const { asset } of activeHoldings) {
    activeAssetsMap.set(asset.id, asset);
  }
  const activeAssetList = Array.from(activeAssetsMap.values());

  // Mapeia preços atualizados hoje por assetId: { priceCents, date }
  const updatedPricesByAssetId = new Map<string, { priceCents: number; date: string }>();

  // 2a. Ações / FIIs / ETFs (B3)
  const b3Assets = activeAssetList.filter(
    (a) =>
      ['stocks', 'fii', 'etf'].includes(a.assetClass) &&
      a.ticker &&
      a.ticker.trim().length > 0,
  );

  if (b3Assets.length > 0) {
    try {
      const tickers = b3Assets.map((a) => a.ticker!.trim());
      const quotes = await providers.fetchB3Quotes(tickers);

      const quoteByTicker = new Map<string, QuoteResult>();
      for (const q of quotes) {
        quoteByTicker.set(q.ticker.toUpperCase(), q);
      }

      for (const asset of b3Assets) {
        const quote = quoteByTicker.get(asset.ticker!.trim().toUpperCase());
        if (quote) {
          await db
            .insert(assetPrices)
            .values({
              assetId: asset.id,
              date: quote.date,
              priceCents: quote.priceCents,
              source: 'brapi',
            })
            .onConflictDoUpdate({
              target: [assetPrices.assetId, assetPrices.date],
              set: { priceCents: quote.priceCents, source: 'brapi' },
            });

          updatedPricesByAssetId.set(asset.id, {
            priceCents: quote.priceCents,
            date: quote.date,
          });
          stats.b3Updated++;
        }
      }
    } catch (err) {
      stats.errors.push(
        `Erro ao atualizar cotações B3: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2b. Tesouro Direto
  const treasuryAssets = activeAssetList.filter((a) => a.assetClass === 'treasury');
  if (treasuryAssets.length > 0) {
    try {
      const quotes = await providers.fetchTreasuryQuotes();

      for (const asset of treasuryAssets) {
        const maturity = asset.maturityDate;
        const assetNormName = normalizeForMatch(asset.name);

        const matchedQuote = quotes.find((q) => {
          if (maturity && q.maturityDate !== maturity) {
            return false;
          }
          const quoteNormType = normalizeForMatch(q.titleType);
          return assetNormName.includes(quoteNormType) || quoteNormType.includes(assetNormName);
        });

        if (matchedQuote) {
          await db
            .insert(assetPrices)
            .values({
              assetId: asset.id,
              date: matchedQuote.date,
              priceCents: matchedQuote.puBaseCents,
              source: 'tesouro',
            })
            .onConflictDoUpdate({
              target: [assetPrices.assetId, assetPrices.date],
              set: { priceCents: matchedQuote.puBaseCents, source: 'tesouro' },
            });

          updatedPricesByAssetId.set(asset.id, {
            priceCents: matchedQuote.puBaseCents,
            date: matchedQuote.date,
          });
          stats.treasuryUpdated++;
        }
      }
    } catch (err) {
      stats.errors.push(
        `Erro ao atualizar cotações do Tesouro: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2c. Cripto (CoinGecko)
  const cryptoAssets = activeAssetList.filter(
    (a) => a.assetClass === 'crypto' && a.ticker && a.ticker.trim().length > 0,
  );

  if (cryptoAssets.length > 0) {
    try {
      const coinIds = cryptoAssets.map((a) => {
        const lower = a.ticker!.trim().toLowerCase();
        return CRYPTO_SYMBOL_MAP[lower] ?? lower;
      });

      const quotes = await providers.fetchCryptoQuotes(coinIds);

      const quoteByCoinId = new Map<string, QuoteResult>();
      for (const q of quotes) {
        quoteByCoinId.set(q.ticker.toLowerCase(), q);
      }

      for (const asset of cryptoAssets) {
        const lower = asset.ticker!.trim().toLowerCase();
        const mappedId = CRYPTO_SYMBOL_MAP[lower] ?? lower;
        const quote = quoteByCoinId.get(mappedId) ?? quoteByCoinId.get(lower);

        if (quote) {
          await db
            .insert(assetPrices)
            .values({
              assetId: asset.id,
              date: quote.date,
              priceCents: quote.priceCents,
              source: 'coingecko',
            })
            .onConflictDoUpdate({
              target: [assetPrices.assetId, assetPrices.date],
              set: { priceCents: quote.priceCents, source: 'coingecko' },
            });

          updatedPricesByAssetId.set(asset.id, {
            priceCents: quote.priceCents,
            date: quote.date,
          });
          stats.cryptoUpdated++;
        }
      }
    } catch (err) {
      stats.errors.push(
        `Erro ao atualizar cotações de Cripto: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. Reavaliação de holdings ativas cujo ativo recebeu preço novo
  const affectedAccountIds = new Set<string>();

  for (const { holding } of activeHoldings) {
    const updated = updatedPricesByAssetId.get(holding.assetId);
    if (!updated) continue;

    const userEdited = Array.isArray(holding.userEditedFields)
      ? holding.userEditedFields
      : [];

    if (userEdited.includes('currentValueCents')) {
      continue;
    }

    const scaledQty = toScaledQty(holding.quantity);
    const newCurrentValueCents = multiplyQtyByPriceCents(scaledQty, updated.priceCents);
    const newProfitCents = newCurrentValueCents - holding.investedCents;

    await db
      .update(holdings)
      .set({
        currentValueCents: newCurrentValueCents,
        profitCents: newProfitCents,
        asOfDate: updated.date,
        updatedAt: new Date(),
      })
      .where(eq(holdings.id, holding.id));

    stats.holdingsRevalued++;
    affectedAccountIds.add(holding.accountId);
  }

  // Atualiza saldo em contas de investimento afetadas
  for (const accountId of affectedAccountIds) {
    const holdingsForAccount = await db
      .select({ currentValueCents: holdings.currentValueCents })
      .from(holdings)
      .where(and(eq(holdings.accountId, accountId), eq(holdings.isRedeemed, false)));

    const balanceCents = holdingsForAccount.reduce((sum, h) => sum + h.currentValueCents, 0);

    await db
      .update(accounts)
      .set({
        balanceCents,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, accountId));
  }

  // 4. Índices e Benchmarks (BCB SGS)
  for (const benchmark of BENCHMARK_CODES) {
    try {
      const [latest] = await db
        .select({ maxDate: sql<string>`max(${benchmarkSeries.date})` })
        .from(benchmarkSeries)
        .where(eq(benchmarkSeries.benchmark, benchmark));

      const since = latest?.maxDate ?? addDaysISO(todayStr, -365);
      const points = await providers.fetchBenchmarkSeries(benchmark, since, todayStr);

      for (const pt of points) {
        await db
          .insert(benchmarkSeries)
          .values({
            benchmark: pt.benchmark,
            date: pt.date,
            valueMicros: pt.valueMicros,
          })
          .onConflictDoUpdate({
            target: [benchmarkSeries.benchmark, benchmarkSeries.date],
            set: { valueMicros: pt.valueMicros },
          });

        stats.benchmarksUpdated++;
      }
    } catch (err) {
      stats.errors.push(
        `Erro ao atualizar série ${benchmark}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return stats;
}
