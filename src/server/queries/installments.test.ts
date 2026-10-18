import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { generateFixtures } from '../../../tests/fixtures/generate';
import { accounts } from '@/server/db/schema';
import { addMonthsISO, monthStart } from '@/server/domain/dates';
import type { Db } from '@/server/db/client';
import { getFutureInstallments } from './installments';

// Data de referência fixa: as consultas nunca devem depender do relógio nos testes
const TODAY = '2026-10-15';
const fixtureOpts = { referenceDate: TODAY, months: 6, seed: 42 };

/** Oráculo independente: parcelas projetadas agrupadas pelo mês de referência da fatura. */
function expectedFuture(onlyAccountKey?: string) {
  const raw = generateFixtures(fixtureOpts);
  const refMonthByInvoice = new Map(raw.invoices.map((i) => [i.key, i.referenceMonth]));
  const start = monthStart(TODAY);
  const end = monthStart(addMonthsISO(start, 12));
  const byMonth = new Map<string, { totalCents: number; count: number }>();
  for (const t of raw.transactions) {
    if (t.status !== 'projected') continue;
    if (onlyAccountKey && t.accountKey !== onlyAccountKey) continue;
    const month = t.invoiceKey ? refMonthByInvoice.get(t.invoiceKey)! : monthStart(t.date);
    if (month < start || month > end) continue;
    const entry = byMonth.get(month) ?? { totalCents: 0, count: 0 };
    entry.totalCents += Math.abs(t.amountCents);
    entry.count += 1;
    byMonth.set(month, entry);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
}

describe('queries / installments', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('bate com o oráculo: parcelas projetadas por mês de referência da fatura', async () => {
    const expected = expectedFuture();
    expect(expected.length).toBeGreaterThan(0);
    expect(await getFutureInstallments(db, {}, { today: TODAY })).toEqual(expected);
  });

  it('filtro por conta traz só as parcelas daquele cartão', async () => {
    const [nubank] = await db.select().from(accounts).where(eq(accounts.name, 'Nubank'));
    const future = await getFutureInstallments(db, { accountIds: [nubank!.id] }, { today: TODAY });
    expect(future).toEqual(expectedFuture('nubank-card'));
  });

  it('não depende do relógio: mesma resposta com o relógio em outro ano', async () => {
    const reference = await getFutureInstallments(db, {}, { today: TODAY });
    vi.useFakeTimers({ now: new Date('2027-10-01T12:00:00Z'), toFake: ['Date'] });
    try {
      expect(await getFutureInstallments(db, {}, { today: TODAY })).toEqual(reference);
    } finally {
      vi.useRealTimers();
    }
  });
});
