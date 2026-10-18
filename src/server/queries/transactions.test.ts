import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getInstallmentGroup, getReviewCount, getTransaction, listTransactions } from './transactions';

describe('queries / transactions', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('paginação com cursor: 3 páginas de 50 cobrem 150 transações sem repetição nem pulo', async () => {
    const f = { from: '2026-05-01', to: '2026-10-15' };

    const page1 = await listTransactions(db, f, { limit: 50 });
    expect(page1.items.length).toBe(50);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listTransactions(db, f, { limit: 50, cursor: page1.nextCursor! });
    expect(page2.items.length).toBe(50);
    expect(page2.nextCursor).toBeTruthy();

    const page3 = await listTransactions(db, f, { limit: 50, cursor: page2.nextCursor! });
    expect(page3.items.length).toBe(50);

    // Verifica que todos os 150 IDs são distintos
    const allIds = [
      ...page1.items.map((t) => t.id),
      ...page2.items.map((t) => t.id),
      ...page3.items.map((t) => t.id),
    ];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(150);

    // Ordem estrita descrescente por data
    for (let i = 1; i < allIds.length; i++) {
      const prev = [...page1.items, ...page2.items, ...page3.items][i - 1]!;
      const curr = [...page1.items, ...page2.items, ...page3.items][i]!;
      expect(prev.date >= curr.date).toBe(true);
    }
  });

  it('filtros funcionam na listagem (ex.: busca e needsReview)', async () => {
    const res = await listTransactions(db, {
      from: '2026-05-01',
      to: '2026-10-15',
      needsReview: true,
    });
    expect(res.items.length).toBeGreaterThan(0);
    for (const item of res.items) {
      expect(item.needsReview).toBe(true);
    }
  });

  it('getTransaction retorna dados completos com fontes', async () => {
    const list = await listTransactions(db, { from: '2026-05-01', to: '2026-10-15' }, { limit: 1 });
    const id = list.items[0]!.id;

    const detail = await getTransaction(db, id);
    expect(detail).toBeDefined();
    expect(detail?.id).toBe(id);
    expect(detail?.account).toBeDefined();
    expect(detail?.institution).toBeDefined();
    expect(detail?.sources.length).toBeGreaterThan(0);
  });

  it('getInstallmentGroup retorna todas as parcelas ordenadas', async () => {
    const list = await listTransactions(db, { from: '2026-05-01', to: '2026-10-15' }, { limit: 100 });
    const parcelada = list.items.find((t) => t.installment?.groupId);
    expect(parcelada).toBeDefined();

    const group = await getInstallmentGroup(db, parcelada!.installment!.groupId!);
    expect(group.length).toBeGreaterThan(1);
    for (let i = 1; i < group.length; i++) {
      expect((group[i]!.installment?.number ?? 0)).toBeGreaterThan((group[i - 1]!.installment?.number ?? 0));
    }
  });

  it('getReviewCount retorna o número de pendências de revisão', async () => {
    const count = await getReviewCount(db);
    expect(count).toBeGreaterThan(0);
  });
});
