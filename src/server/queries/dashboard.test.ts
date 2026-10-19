import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { generateFixtures } from '../../../tests/fixtures/generate';
import { accounts, institutions } from '@/server/db/schema';
import { addMonthsISO, monthStart } from '@/server/domain/dates';
import type { Db } from '@/server/db/client';
import { getAccountsOverview } from './accounts';
import type { BreakdownItem } from './breakdown';
import { getDashboardKpis, percentChange, summarizeAccounts, topWithOthers, trailingMonthsRange } from './dashboard';

const TODAY = '2026-10-15';
const fixtureOpts = { referenceDate: TODAY, months: 6, seed: 42 };
const OCT = { from: '2026-10-01', to: '2026-10-31', basis: 'accrual' as const };

/** Oráculo independente, em JavaScript puro sobre os dados gerados (não repete o SQL). */
function oracle(onlyAccountKeys?: string[]) {
  const raw = generateFixtures(fixtureOpts);
  const keep = (key: string) => !onlyAccountKeys || onlyAccountKeys.includes(key);
  const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

  let expense = 0;
  let income = 0;
  let prevExpense = 0;
  for (const t of raw.transactions) {
    if (t.status === 'projected' || !keep(t.accountKey)) continue;
    const spend = t.kind === 'expense' ? Math.abs(t.amountCents) : t.kind === 'refund' ? -Math.abs(t.amountCents) : 0;
    if (inRange(t.date, OCT.from, OCT.to)) {
      expense += spend;
      if (t.kind === 'income') income += t.amountCents;
    }
    if (inRange(t.date, '2026-09-01', '2026-09-30')) prevExpense += spend;
  }

  // Saldo: soma das transações lançadas de cada conta corrente
  const checkingKeys = raw.accounts.filter((a) => a.type === 'checking' && keep(a.key)).map((a) => a.key);
  const balance = raw.transactions
    .filter((t) => checkingKeys.includes(t.accountKey) && t.status === 'posted')
    .reduce((s, t) => s + t.amountCents, 0);

  // Dívida de cartão: faturas fechadas/vencidas + a aberta de menor mês de referência
  const cardKeys = raw.accounts.filter((a) => a.type === 'credit_card' && keep(a.key)).map((a) => a.key);
  let cardDebt = 0;
  for (const key of cardKeys) {
    const invs = raw.invoices.filter((i) => i.accountKey === key);
    cardDebt += invs
      .filter((i) => i.status === 'closed' || i.status === 'overdue')
      .reduce((s, i) => s + Math.max(0, i.totalCents), 0);
    const open = invs.filter((i) => i.status === 'open').sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth))[0];
    cardDebt += Math.max(0, open?.totalCents ?? 0);
  }

  // Parcelas futuras: projetadas nos próximos 12 meses (mês de referência da fatura)
  const refMonth = new Map(raw.invoices.map((i) => [i.key, i.referenceMonth]));
  const start = monthStart(TODAY);
  const end = monthStart(addMonthsISO(start, 12));
  let future = 0;
  for (const t of raw.transactions) {
    if (t.status !== 'projected' || !keep(t.accountKey)) continue;
    const m = t.invoiceKey ? refMonth.get(t.invoiceKey)! : monthStart(t.date);
    if (m >= start && m <= end) future += Math.abs(t.amountCents);
  }

  return { expense, income, prevExpense, balance, cardDebt, future, cardCount: cardKeys.length };
}

describe('queries / dashboard', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  describe('getDashboardKpis bate com o oráculo', () => {
    it('visão "Tudo": gastos, receitas, saldos, faturas e parcelas', async () => {
      const o = oracle();
      const k = await getDashboardKpis(db, OCT, { today: TODAY });
      expect(k.expenseCents).toBe(o.expense);
      expect(k.incomeCents).toBe(o.income);
      expect(k.netCents).toBe(o.income - o.expense);
      expect(k.previousExpenseCents).toBe(o.prevExpense);
      expect(k.balanceCents).toBe(o.balance);
      expect(k.openInvoicesCents).toBe(o.cardDebt);
      expect(k.futureInstallmentsCents).toBe(o.future);
      expect(k.futureInstallmentsCents).toBeGreaterThan(0);
      expect(k.institutionCount).toBe(3);
      expect(k.cardCount).toBe(4);
      expect(k.hasAccounts).toBe(true);
    });

    it('saldos são a soma de totals de getAccountsOverview', async () => {
      const overview = await getAccountsOverview(db, { today: TODAY });
      const k = await getDashboardKpis(db, OCT, { today: TODAY, overview });
      expect(k.balanceCents).toBe(overview.reduce((s, i) => s + i.totals.balanceCents, 0));
      expect(k.openInvoicesCents).toBe(overview.reduce((s, i) => s + i.totals.cardDebtCents, 0));
    });

    it('visão por instituição (Nubank) restringe todos os KPIs', async () => {
      const [nubank] = await db.select().from(institutions).where(eq(institutions.slug, 'nubank'));
      const o = oracle(['nubank-conta', 'nubank-card']);
      const k = await getDashboardKpis(db, { ...OCT, institutionIds: [nubank!.id] }, { today: TODAY });
      expect(k.expenseCents).toBe(o.expense);
      expect(k.balanceCents).toBe(o.balance);
      expect(k.openInvoicesCents).toBe(o.cardDebt);
      expect(k.futureInstallmentsCents).toBe(o.future);
      expect(k.institutionCount).toBe(1);
      expect(k.cardCount).toBe(1);
    });

    it('visão por conta corrente: saldo só daquela conta, sem faturas', async () => {
      const [conta] = await db.select().from(accounts).where(eq(accounts.name, 'Nubank Conta'));
      const o = oracle(['nubank-conta']);
      const k = await getDashboardKpis(db, { ...OCT, accountIds: [conta!.id] }, { today: TODAY });
      expect(k.expenseCents).toBe(o.expense);
      expect(k.balanceCents).toBe(o.balance);
      expect(k.openInvoicesCents).toBe(0);
      expect(k.cardCount).toBe(0);
      expect(k.upcomingInvoices).toEqual([]);
    });
  });

  describe('summarizeAccounts', () => {
    it('próximas faturas: uma por cartão com fatura aberta, ordenadas por vencimento', async () => {
      const overview = await getAccountsOverview(db, { today: TODAY });
      const { upcomingInvoices } = summarizeAccounts(overview);
      expect(upcomingInvoices).toHaveLength(4);
      const dues = upcomingInvoices.map((i) => i.dueDate);
      expect(dues).toEqual([...dues].sort());
      for (const inv of upcomingInvoices) expect(inv.dueDate >= TODAY).toBe(true);
    });

    it('lista vazia → tudo zero', () => {
      expect(summarizeAccounts([])).toEqual({
        balanceCents: 0,
        institutionCount: 0,
        openInvoicesCents: 0,
        cardCount: 0,
        upcomingInvoices: [],
      });
    });
  });

  describe('percentChange', () => {
    it('calcula a variação relativa', () => {
      expect(percentChange(112, 100)).toBeCloseTo(0.12);
      expect(percentChange(80, 100)).toBeCloseTo(-0.2);
      expect(percentChange(100, 100)).toBe(0);
    });
    it('anterior 0 → null (a UI mostra "—")', () => {
      expect(percentChange(500, 0)).toBeNull();
    });
  });

  describe('trailingMonthsRange', () => {
    it('6 meses terminando no fim do filtro', () => {
      expect(trailingMonthsRange({ from: '2026-10-01', to: '2026-10-31' }, 6)).toEqual({
        from: '2026-05-01',
        to: '2026-10-31',
      });
      expect(trailingMonthsRange({ from: '2026-03-10', to: '2026-03-20' }, 12)).toEqual({
        from: '2025-04-01',
        to: '2026-03-20',
      });
    });
  });

  describe('topWithOthers', () => {
    const item = (key: string, totalCents: number, count = 1): BreakdownItem => ({
      key,
      label: key,
      color: null,
      totalCents,
      count,
    });

    it('top N + "Outras" com o restante; a soma é preservada', () => {
      const items = [item('a', 500), item('b', 400), item('c', 300), item('d', 200), item('e', -50)];
      const top = topWithOthers(items, 2);
      expect(top.map((t) => t.key)).toEqual(['a', 'b', 'outras']);
      expect(top[2]!.totalCents).toBe(300 + 200 - 50);
      expect(top[2]!.isOthers).toBe(true);
      expect(top.reduce((s, t) => s + t.totalCents, 0)).toBe(items.reduce((s, t) => s + t.totalCents, 0));
    });

    it('linha negativa (estorno maior que compras) nunca vira fatia própria', () => {
      const top = topWithOthers([item('a', 500), item('estorno', -100)], 7);
      expect(top.map((t) => t.key)).toEqual(['a', 'outras']);
      expect(top[1]!.totalCents).toBe(-100);
    });

    it('sem sobra → sem "Outras"', () => {
      expect(topWithOthers([item('a', 1), item('b', 2)], 7).map((t) => t.key)).toEqual(['b', 'a']);
    });
  });
});
