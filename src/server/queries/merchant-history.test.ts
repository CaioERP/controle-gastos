import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getMerchantHistory, listMerchantsWithSpend } from './merchant-history';

describe('queries / merchant-history', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 12, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('devolve null para estabelecimento inexistente', async () => {
    const res = await getMerchantHistory(db, '00000000-0000-0000-0000-000000000000');
    expect(res).toBeNull();
  });

  it('calcula histórico de 12 meses para estabelecimento existente', async () => {
    const all = await listMerchantsWithSpend(db, { today: '2026-10-15' });
    expect(all.length).toBeGreaterThan(0);
    const first = all[0]!;

    const history = await getMerchantHistory(db, first.id, { today: '2026-10-15' });
    expect(history).not.toBeNull();
    expect(history!.merchant.id).toBe(first.id);
    expect(history!.merchant.name).toBe(first.name);
    expect(history!.last12.totalCents).toBe(first.totalCents);
    expect(history!.last12.count).toBe(first.count);
    expect(history!.monthly).toHaveLength(12);
    expect(history!.monthly[11]!.month).toBe('2026-10');

    // Soma dos meses deve ser igual ao total em 12 meses
    const sumMonthly = history!.monthly.reduce((acc, m) => acc + m.totalCents, 0);
    expect(sumMonthly).toBe(history!.last12.totalCents);

    // Soma das formas de pagamento deve ser igual ao total
    const sumPaymentMethods = history!.byPaymentMethod.reduce((acc, p) => acc + p.totalCents, 0);
    expect(sumPaymentMethods).toBe(history!.last12.totalCents);

    // Datas devem estar preenchidas
    expect(history!.firstDate).not.toBeNull();
    expect(history!.lastDate).not.toBeNull();
  });

  it('listMerchantsWithSpend filtra por busca', async () => {
    const all = await listMerchantsWithSpend(db, { today: '2026-10-15' });
    const target = all[0]!;
    const filtered = await listMerchantsWithSpend(db, { today: '2026-10-15', search: target.name.slice(0, 3) });
    expect(filtered.some((m) => m.id === target.id)).toBe(true);
  });
});
