import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { getAccountsOverview } from './accounts';

describe('queries / accounts', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('getAccountsOverview traz as 3 instituições, 4 contas-cartão e 2 cartões no Nubank', async () => {
    const overview = await getAccountsOverview(db);
    expect(overview.length).toBe(3);

    const slugs = overview.map((o) => o.institution.slug);
    expect(slugs).toContain('itau');
    expect(slugs).toContain('nubank');
    expect(slugs).toContain('mercado-pago');

    // Total de contas de cartão deve ser 4 (Itaú Click, Itaú Personnalité, Nubank, Mercado Pago)
    const allAccounts = overview.flatMap((o) => o.accounts);
    const creditAccounts = allAccounts.filter((a) => a.type === 'credit_card');
    expect(creditAccounts.length).toBe(4);

    // Nubank tem 2 cartões (físico e virtual)
    const nubankInst = overview.find((o) => o.institution.slug === 'nubank')!;
    const nubankCardAcc = nubankInst.accounts.find((a) => a.type === 'credit_card')!;
    expect(nubankCardAcc.cards.length).toBe(2);

    // Totais calculados
    for (const inst of overview) {
      expect(typeof inst.totals.balanceCents).toBe('number');
      expect(typeof inst.totals.cardDebtCents).toBe('number');
      expect(inst.totals.cardDebtCents).toBeGreaterThanOrEqual(0);
    }
  });
});
