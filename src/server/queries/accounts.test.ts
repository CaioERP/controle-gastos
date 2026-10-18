import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { invoices } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getAccountsOverview } from './accounts';

// Data de referência fixa: as consultas nunca devem depender do relógio nos testes
const TODAY = '2026-10-15';

describe('queries / accounts', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: TODAY, months: 6, seed: 42 });
  });

  it('traz as 3 instituições, 4 contas-cartão e 2 cartões no Nubank', async () => {
    const overview = await getAccountsOverview(db, { today: TODAY });
    expect(overview.map((o) => o.institution.slug).sort()).toEqual(['itau', 'mercado-pago', 'nubank']);

    const allAccounts = overview.flatMap((o) => o.accounts);
    expect(allAccounts.filter((a) => a.type === 'credit_card').length).toBe(4);

    const nubank = overview.find((o) => o.institution.slug === 'nubank')!;
    expect(nubank.accounts.find((a) => a.type === 'credit_card')!.cards.length).toBe(2);

    // Contas correntes primeiro, depois cartões
    for (const inst of overview) {
      const types = inst.accounts.map((a) => a.type);
      expect(types.indexOf('checking')).toBeLessThan(types.indexOf('credit_card'));
    }
  });

  it('openInvoice, limite disponível e dívida de cartão conferem com as faturas do banco', async () => {
    const overview = await getAccountsOverview(db, { today: TODAY });
    const allInvoices = await db.select().from(invoices);

    for (const inst of overview) {
      let expectedDebt = 0;
      for (const acc of inst.accounts.filter((a) => a.type === 'credit_card')) {
        const unpaid = allInvoices.filter((i) => i.accountId === acc.id && i.status !== 'paid');

        const expectedOpen = unpaid
          .filter((i) => i.dueDate >= TODAY)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
        expect(expectedOpen).toBeDefined();
        expect(acc.credit?.openInvoice?.id).toBe(expectedOpen!.id);
        expect(acc.credit!.openInvoice!.dueDate >= TODAY).toBe(true);
        expect(acc.credit?.availableCents).not.toBeNull();
        expect(acc.credit!.availableCents!).toBeLessThan(acc.credit!.limitCents!);

        const closedOrOverdue = unpaid
          .filter((i) => i.status === 'closed' || i.status === 'overdue')
          .reduce((s, i) => s + i.totalCents, 0);
        const currentOpen = unpaid
          .filter((i) => i.status === 'open')
          .sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth))[0];
        expectedDebt += closedOrOverdue + (currentOpen?.totalCents ?? 0);
      }
      expect(inst.totals.cardDebtCents).toBe(expectedDebt);
    }
  });

  it('não depende do relógio: mesma resposta com o relógio em outro ano', async () => {
    const reference = await getAccountsOverview(db, { today: TODAY });
    vi.useFakeTimers({ now: new Date('2027-10-01T12:00:00Z'), toFake: ['Date'] });
    try {
      expect(await getAccountsOverview(db, { today: TODAY })).toEqual(reference);
    } finally {
      vi.useRealTimers();
    }
  });
});
