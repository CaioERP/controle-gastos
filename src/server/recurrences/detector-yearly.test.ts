import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { accounts, institutions, recurrences, transactions } from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import { runRecurrenceDetection } from '@/server/recurrences/detector';

describe('detector: anuais e parcelas', () => {
  it('detecta cobrança anual com 3 anos de histórico e ignora parcelas', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const [inst] = await db.select().from(institutions).limit(1);
    const instId = (inst as { id: string }).id;
    const [acc] = await db
      .insert(accounts)
      .values({
        name: 'Cartão',
        type: 'credit_card',
        institutionId: instId,
        currency: 'BRL',
        balanceCents: 0,
      })
      .returning();
    const accId = (acc as { id: string }).id;
    const base = {
      accountId: accId,
      currency: 'BRL',
      kind: 'expense' as const,
      status: 'posted' as const,
      paymentMethod: 'pix' as const,
    };
    const groupId = '11111111-1111-4111-8111-111111111111';
    const yearly = ['2024-03-05', '2025-03-05', '2026-03-05'].map((date) => ({
      ...base,
      date,
      amountCents: -12000,
      descriptionRaw: 'SEGURO ANUAL',
      description: 'Seguro Anual',
    }));
    const installments = ['2026-07-10', '2026-08-10', '2026-09-10'].map((date, i) => ({
      ...base,
      date,
      amountCents: -20000,
      descriptionRaw: 'LOJA PARCELADA',
      description: 'Loja Parcelada',
      installmentGroupId: groupId,
      installmentNumber: i + 1,
      installmentTotal: 10,
    }));
    await db.insert(transactions).values([...yearly, ...installments]);

    const res = await runRecurrenceDetection(db, { today: '2026-10-15' });
    expect(res.detected).toBe(1);
    const rows = await db.select().from(recurrences);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.frequency).toBe('yearly');
    expect(rows[0]?.amountCents).toBe(12000);
  });
});
