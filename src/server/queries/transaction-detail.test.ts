import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { listTransactions } from './transactions';
import { getTransactionInvoice } from './transaction-detail';

describe('queries / transaction-detail', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: '2026-10-15', months: 6, seed: 42 });
  });

  it('transação de cartão tem a fatura da própria conta; conta corrente não tem fatura', async () => {
    const { items } = await listTransactions(db, { from: '2026-09-01', to: '2026-10-15' }, { limit: 200 });
    const card = items.filter((t) => t.account.type === 'credit_card');
    const checking = items.filter((t) => t.account.type === 'checking');
    expect(card.length).toBeGreaterThan(0);
    expect(checking.length).toBeGreaterThan(0);

    for (const t of card.slice(0, 20)) {
      const inv = await getTransactionInvoice(db, t.id);
      expect(inv).not.toBeNull();
      expect(inv!.accountId).toBe(t.account.id);
      expect(inv!.referenceMonth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A fatura vence depois da compra
      expect(inv!.dueDate >= t.date).toBe(true);
    }
    for (const t of checking.slice(0, 10)) {
      expect(await getTransactionInvoice(db, t.id)).toBeNull();
    }
  });

  it('id inválido ou inexistente retorna null', async () => {
    expect(await getTransactionInvoice(db, 'nao-e-uuid')).toBeNull();
    expect(await getTransactionInvoice(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
