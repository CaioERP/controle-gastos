import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { recurrences } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getSubscriptionsSummary, normalizeMonthlyAmount } from './recurrences';

describe('recurrences queries', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
  });

  it('normaliza corretamente valores para o mês de acordo com a frequência', () => {
    expect(normalizeMonthlyAmount(12000, 'yearly')).toBe(1000); // 120/12 = 10
    expect(normalizeMonthlyAmount(3000, 'quarterly')).toBe(1000); // 30/3 = 10
    expect(normalizeMonthlyAmount(5000, 'monthly')).toBe(5000);
  });

  it('consolida resumo de assinaturas ativas, total mensal e anual e detecta aumento de preço', async () => {
    // 1. Mensal regular (Netflix R$ 50,00)
    await db.insert(recurrences).values({
      description: 'Netflix',
      amountCents: 5000,
      frequency: 'monthly',
      status: 'active',
      isSubscription: true,
      firstDate: '2026-05-10',
      lastDate: '2026-10-10',
      lastAmountCents: 5000,
      autoDetected: true,
    });

    // 2. Anual (Amazon Prime R$ 120,00/ano -> R$ 10,00/mês)
    await db.insert(recurrences).values({
      description: 'Amazon Prime Anual',
      amountCents: 12000,
      frequency: 'yearly',
      status: 'active',
      isSubscription: true,
      firstDate: '2025-10-01',
      lastDate: '2026-10-01',
      lastAmountCents: 12000,
      autoDetected: false,
    });

    // 3. Com aumento recente (Spotify subiu de R$ 34,90 para R$ 40,90)
    await db.insert(recurrences).values({
      description: 'Spotify Family',
      amountCents: 3490,
      frequency: 'monthly',
      status: 'active',
      isSubscription: true,
      firstDate: '2026-01-15',
      lastDate: '2026-10-15',
      lastAmountCents: 4090, // subiu
      autoDetected: true,
    });

    // 4. Pausada (Academia R$ 120,00)
    await db.insert(recurrences).values({
      description: 'Academia',
      amountCents: 12000,
      frequency: 'monthly',
      status: 'paused',
      isSubscription: false,
      firstDate: '2026-01-05',
      lastDate: '2026-08-05',
      lastAmountCents: 12000,
      autoDetected: false,
    });

    const summary = await getSubscriptionsSummary(db);

    // Ativas: Netflix (5000) + Amazon (1000) + Spotify no valor vigente (4090) = 10090 centavos/mês
    expect(summary.activeCount).toBe(3);
    expect(summary.monthlyTotalCents).toBe(10090);
    // Anual: Netflix (5000*12=60000) + Amazon (12000) + Spotify (4090*12=49080) = 121080
    expect(summary.yearlyTotalCents).toBe(121080);
    expect(summary.priceHikesCount).toBe(1);

    const spotify = summary.items.find((i) => i.description === 'Spotify Family');
    expect(spotify).toBeDefined();
    expect(spotify?.hasPriceHike).toBe(true);
    expect(spotify?.previousAmountCents).toBe(3490);
    expect(spotify?.lastAmountCents).toBe(4090);

    // Filtro por status
    const pausedSummary = await getSubscriptionsSummary(db, { status: 'paused' });
    expect(pausedSummary.items.length).toBe(1);
    expect(pausedSummary.items[0]?.description).toBe('Academia');
  });
});
