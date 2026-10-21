import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  assetPrices,
  assets,
  benchmarkSeries,
  holdings,
  institutions,
} from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import { createFakeMarketDataProviders } from './providers/fake';
import { updateMarketPricesAndBenchmarks } from './update-prices';

describe('updateMarketPricesAndBenchmarks (A3-02)', () => {
  async function setup() {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db
      .select()
      .from(institutions)
      .where(eq(institutions.slug, 'itau'))
      .limit(1);

    const [invAcc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'investment',
        name: 'Itaú Corretora',
        balanceCents: 0,
        includeInTotals: true,
      })
      .returning();

    // Ativo B3: PETR4
    const [petr4Asset] = await db
      .insert(assets)
      .values({
        code: 'B3:PETR4',
        name: 'Petrobras PN',
        assetClass: 'stocks',
        ticker: 'PETR4',
      })
      .returning();

    // Posição de 100 cotas a preço médio R$ 35,00 (investido R$ 3.500,00)
    const [petr4Holding] = await db
      .insert(holdings)
      .values({
        accountId: invAcc!.id,
        assetId: petr4Asset!.id,
        source: 'manual',
        externalId: 'manual:petr4',
        quantity: '100.00000000',
        investedCents: 350000,
        currentValueCents: 350000,
        averagePriceCents: 3500,
        asOfDate: '2026-10-19',
      })
      .returning();

    // Ativo Tesouro
    const [tesouroAsset] = await db
      .insert(assets)
      .values({
        code: 'TESOURO:TESOURO SELIC 2029:2029-03-01',
        name: 'Tesouro Selic 2029',
        assetClass: 'treasury',
        maturityDate: '2029-03-01',
      })
      .returning();

    const [tesouroHolding] = await db
      .insert(holdings)
      .values({
        accountId: invAcc!.id,
        assetId: tesouroAsset!.id,
        source: 'manual',
        externalId: 'manual:tesouro',
        quantity: '1.00000000',
        investedCents: 1400000,
        currentValueCents: 1400000,
        asOfDate: '2026-10-19',
      })
      .returning();

    // Ativo Cripto: BTC
    const [btcAsset] = await db
      .insert(assets)
      .values({
        code: 'CRYPTO:BTC',
        name: 'Bitcoin',
        assetClass: 'crypto',
        ticker: 'btc',
      })
      .returning();

    const [btcHolding] = await db
      .insert(holdings)
      .values({
        accountId: invAcc!.id,
        assetId: btcAsset!.id,
        source: 'manual',
        externalId: 'manual:btc',
        quantity: '0.10000000',
        investedCents: 3000000,
        currentValueCents: 3000000,
        asOfDate: '2026-10-19',
      })
      .returning();

    return {
      db,
      invAcc: invAcc!,
      petr4Asset: petr4Asset!,
      petr4Holding: petr4Holding!,
      tesouroAsset: tesouroAsset!,
      tesouroHolding: tesouroHolding!,
      btcAsset: btcAsset!,
      btcHolding: btcHolding!,
    };
  }

  it('atualiza preço de PETR4, reavalia holding e atualiza saldo da conta', async () => {
    const { db, invAcc, petr4Asset, petr4Holding } = await setup();

    const providers = createFakeMarketDataProviders({
      b3Quotes: [
        {
          ticker: 'PETR4',
          priceCents: 4118, // R$ 41,18
          date: '2026-10-20',
        },
      ],
      treasuryQuotes: [
        {
          titleType: 'Tesouro Selic',
          maturityDate: '2029-03-01',
          puBaseCents: 1495120, // R$ 14.951,20
          date: '2026-10-20',
        },
      ],
      cryptoQuotes: [
        {
          ticker: 'bitcoin',
          priceCents: 38000000, // R$ 380.000,00 -> 0.1 cotas = R$ 38.000,00
          date: '2026-10-20',
        },
      ],
      benchmarkPoints: [
        {
          benchmark: 'cdi',
          date: '2026-10-20',
          valueMicros: 40200,
        },
      ],
    });

    const stats = await updateMarketPricesAndBenchmarks(db, {
      providers,
      today: '2026-10-20',
    });

    expect(stats.errors).toEqual([]);
    expect(stats.b3Updated).toBe(1);
    expect(stats.treasuryUpdated).toBe(1);
    expect(stats.cryptoUpdated).toBe(1);
    expect(stats.benchmarksUpdated).toBe(1);
    expect(stats.holdingsRevalued).toBe(3);

    // Verifica cotação gravada em asset_prices
    const [price] = await db
      .select()
      .from(assetPrices)
      .where(eq(assetPrices.assetId, petr4Asset.id));
    expect(price?.priceCents).toBe(4118);
    expect(price?.source).toBe('brapi');

    // 100 cotas * 4118 = 411800 centavos (R$ 4.118,00)
    const [updatedHolding] = await db
      .select()
      .from(holdings)
      .where(eq(holdings.id, petr4Holding.id));
    expect(updatedHolding?.currentValueCents).toBe(411800);
    expect(updatedHolding?.profitCents).toBe(411800 - 350000); // R$ 618,00 de lucro
    expect(updatedHolding?.asOfDate).toBe('2026-10-20');

    // Verifica saldo da conta de investimento: 411800 + 1495120 + 3800000 = 5706920
    const [updatedAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, invAcc.id));
    expect(updatedAccount?.balanceCents).toBe(411800 + 1495120 + 3800000);
  });

  it('resiliência: falha simulada no tesouro registra em stats.errors e não quebra os outros provedores', async () => {
    const { db } = await setup();

    const providers = createFakeMarketDataProviders({
      b3Quotes: [{ ticker: 'PETR4', priceCents: 4200, date: '2026-10-20' }],
      treasuryQuotes: async () => {
        throw new Error('Serviço Tesouro Indisponível (503)');
      },
      benchmarkPoints: [{ benchmark: 'cdi', date: '2026-10-20', valueMicros: 40000 }],
    });

    const stats = await updateMarketPricesAndBenchmarks(db, {
      providers,
      today: '2026-10-20',
    });

    expect(stats.errors.length).toBe(1);
    expect(stats.errors[0]).toContain('Serviço Tesouro Indisponível');
    expect(stats.b3Updated).toBe(1);
    expect(stats.treasuryUpdated).toBe(0);
    expect(stats.benchmarksUpdated).toBe(1);
  });

  it('idempotência: rodar 2 vezes no mesmo dia faz upsert sem duplicar linhas', async () => {
    const { db, petr4Asset } = await setup();

    const providers = createFakeMarketDataProviders({
      b3Quotes: [{ ticker: 'PETR4', priceCents: 4150, date: '2026-10-20' }],
      benchmarkPoints: [{ benchmark: 'cdi', date: '2026-10-20', valueMicros: 40200 }],
    });

    await updateMarketPricesAndBenchmarks(db, { providers, today: '2026-10-20' });
    await updateMarketPricesAndBenchmarks(db, { providers, today: '2026-10-20' });

    const prices = await db
      .select()
      .from(assetPrices)
      .where(eq(assetPrices.assetId, petr4Asset.id));
    expect(prices).toHaveLength(1);
    expect(prices[0]?.priceCents).toBe(4150);

    const bSeries = await db
      .select()
      .from(benchmarkSeries)
      .where(eq(benchmarkSeries.benchmark, 'cdi'));
    expect(bSeries).toHaveLength(1);
  });

  it('respeita userEditedFields e não altera currentValueCents', async () => {
    const { db, petr4Holding } = await setup();

    // Marca currentValueCents como editado pelo usuário
    await db
      .update(holdings)
      .set({
        userEditedFields: ['currentValueCents'],
        currentValueCents: 999999,
      })
      .where(eq(holdings.id, petr4Holding.id));

    const providers = createFakeMarketDataProviders({
      b3Quotes: [{ ticker: 'PETR4', priceCents: 5000, date: '2026-10-20' }],
    });

    await updateMarketPricesAndBenchmarks(db, { providers, today: '2026-10-20' });

    const [holdingAfter] = await db
      .select()
      .from(holdings)
      .where(eq(holdings.id, petr4Holding.id));

    expect(holdingAfter?.currentValueCents).toBe(999999);
  });
});
