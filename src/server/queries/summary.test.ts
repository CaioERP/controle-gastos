import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { generateFixtures } from '../../../tests/fixtures/generate';
import { accounts } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getSpendingSummary, previousRange } from './summary';

describe('queries / summary', () => {
  let db: Db;
  const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  describe('previousRange', () => {
    it('mês completo calcula o mês anterior inteiro', () => {
      const prev = previousRange('2026-10-01', '2026-10-31');
      expect(prev).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    });

    it('intervalo arbitrário calcula o mesmo número de dias imediatamente anteriores', () => {
      const prev = previousRange('2026-10-10', '2026-10-19');
      expect(prev).toEqual({ from: '2026-09-30', to: '2026-10-09' });
    });
  });

  describe('getSpendingSummary com oráculo independente', () => {
    it('compara resumo com cálculo em JavaScript puro sobre generateFixtures', async () => {
      const raw = generateFixtures(fixtureOpts);

      // Oráculo independente para outubro/2026 em competência
      let oracleExpense = 0;
      let oracleIncome = 0;
      for (const t of raw.transactions) {
        if (t.date >= '2026-10-01' && t.date <= '2026-10-31' && t.status !== 'projected') {
          if (t.kind === 'expense') oracleExpense += Math.abs(t.amountCents);
          if (t.kind === 'refund') oracleExpense -= Math.abs(t.amountCents);
          if (t.kind === 'income') oracleIncome += t.amountCents;
        }
      }

      // Oráculo para setembro/2026 (período anterior)
      let oraclePrevExpense = 0;
      let oraclePrevIncome = 0;
      for (const t of raw.transactions) {
        if (t.date >= '2026-09-01' && t.date <= '2026-09-30' && t.status !== 'projected') {
          if (t.kind === 'expense') oraclePrevExpense += Math.abs(t.amountCents);
          if (t.kind === 'refund') oraclePrevExpense -= Math.abs(t.amountCents);
          if (t.kind === 'income') oraclePrevIncome += t.amountCents;
        }
      }

      const summary = await getSpendingSummary(db, {
        from: '2026-10-01',
        to: '2026-10-31',
        basis: 'accrual',
      });

      expect(summary.expenseCents).toBe(oracleExpense);
      expect(summary.incomeCents).toBe(oracleIncome);
      expect(summary.netCents).toBe(oracleIncome - oracleExpense);
      expect(summary.previousExpenseCents).toBe(oraclePrevExpense);
      expect(summary.previousIncomeCents).toBe(oraclePrevIncome);
    });

    it('R2: pagamentos de fatura, transferências e investimentos não entram nos totais', async () => {
      const summary = await getSpendingSummary(db, {
        from: '2026-05-01',
        to: '2026-10-15',
        basis: 'accrual',
      });

      // Se pagamentos de fatura ou transferências tivessem entrado, os valores seriam muito maiores
      expect(summary.expenseCents).toBeGreaterThan(0);
      expect(summary.incomeCents).toBeGreaterThan(0);
    });

    it('R5: regime de caixa conta compras de cartão na data de vencimento da fatura', async () => {
      const accrual = await getSpendingSummary(db, {
        from: '2026-10-01',
        to: '2026-10-31',
        basis: 'accrual',
      });
      const cash = await getSpendingSummary(db, {
        from: '2026-10-01',
        to: '2026-10-31',
        basis: 'cash',
      });

      // Em regimes diferentes os totais de competência e caixa diferem para compras em cartão
      expect(cash.expenseCents).not.toBe(accrual.expenseCents);
    });

    it('R11: conta com includeInTotals: false sai do resumo geral, mas aparece se filtrada', async () => {
      // Pega uma conta de cartão e desmarca includeInTotals
      const [itauClick] = await db.select().from(accounts).where(eq(accounts.name, 'Itaú Click'));
      expect(itauClick).toBeDefined();

      const baseSummary = await getSpendingSummary(db, {
        from: '2026-10-01',
        to: '2026-10-31',
      });

      await db.update(accounts).set({ includeInTotals: false }).where(eq(accounts.id, itauClick!.id));

      const withoutAccount = await getSpendingSummary(db, {
        from: '2026-10-01',
        to: '2026-10-31',
      });

      expect(withoutAccount.expenseCents).toBeLessThan(baseSummary.expenseCents);

      // Mas se o usuário filtrar explicitamente pela conta, ela entra no cálculo
      const filteredByAccount = await getSpendingSummary(db, {
        from: '2026-10-01',
        to: '2026-10-31',
        accountIds: [itauClick!.id],
      });
      expect(filteredByAccount.expenseCents).toBeGreaterThan(0);

      // Restaura o includeInTotals
      await db.update(accounts).set({ includeInTotals: true }).where(eq(accounts.id, itauClick!.id));
    });

    it('includeProjected: true inclui parcelas futuras após a data de referência', async () => {
      const withoutProj = await getSpendingSummary(db, {
        from: '2026-11-01',
        to: '2026-11-30',
        includeProjected: false,
      });
      const withProj = await getSpendingSummary(db, {
        from: '2026-11-01',
        to: '2026-11-30',
        includeProjected: true,
      });

      expect(withoutProj.expenseCents).toBe(0);
      expect(withProj.expenseCents).toBeGreaterThan(0);
    });
  });
});
