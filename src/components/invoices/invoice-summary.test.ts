import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { generateFixtures } from '../../../tests/fixtures/generate';
import { loadFixtures } from '../../../tests/fixtures/load';
import { seedBase } from '@/server/db/seed';
import { accounts } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getInvoiceItems, getInvoices, type InvoiceSummary } from '@/server/queries/invoices';
import type { TransactionRow } from '@/server/queries/transaction-row';
import {
  fillInstallmentMonths,
  formatMonthShort,
  groupItemsByDate,
  isForecastInvoice,
  pickDefaultInvoice,
  sumInvoiceItems,
  topCategories,
} from './invoice-summary';

const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };

function invoice(partial: Partial<InvoiceSummary> & { referenceMonth: string }): InvoiceSummary {
  return {
    id: partial.referenceMonth,
    closingDate: partial.referenceMonth,
    dueDate: partial.referenceMonth.slice(0, 8) + '10',
    totalCents: 1000,
    status: 'open',
    paidAt: null,
    paidAmountCents: null,
    itemCount: 3,
    projectedCount: 0,
    ...partial,
  };
}

type ItemInput = Pick<TransactionRow, 'date' | 'amountCents' | 'category'>;

function item(date: string, amountCents: number, category: string | null, parentName: string | null = null): ItemInput {
  return {
    date,
    amountCents,
    category: category ? { id: category, name: category, color: '#111111', icon: 'tag', parentName } : null,
  };
}

describe('invoice-summary (dados fictícios)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  it('a soma dos itens exibidos é igual ao total de toda fatura de todos os cartões', async () => {
    const cards = await db.select().from(accounts).where(eq(accounts.type, 'credit_card'));
    expect(cards.length).toBe(4);

    let checked = 0;
    for (const card of cards) {
      for (const inv of await getInvoices(db, card.id)) {
        const items = await getInvoiceItems(db, inv.id);
        expect(items.length).toBe(inv.itemCount);
        expect(sumInvoiceItems(items)).toBe(inv.totalCents);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('oráculo independente: total por fatura igual ao calculado sobre generateFixtures', async () => {
    const data = generateFixtures(fixtureOpts);
    const [nubank] = await db.select().from(accounts).where(eq(accounts.name, 'Nubank'));
    const invoices = await getInvoices(db, nubank!.id);

    for (const fx of data.invoices.filter((i) => i.accountKey === 'nubank-card')) {
      const expected = data.transactions
        .filter((t) => t.invoiceKey === fx.key && t.kind !== 'invoice_payment')
        .reduce((sum, t) => sum - t.amountCents, 0);
      const inv = invoices.find((i) => i.referenceMonth === fx.referenceMonth);
      expect(inv).toBeDefined();
      const items = await getInvoiceItems(db, inv!.id);
      expect(sumInvoiceItems(items)).toBe(expected);
    }
  });

  it('fatura futura com só parcelas projetadas é marcada como prevista', async () => {
    const cards = await db.select().from(accounts).where(eq(accounts.type, 'credit_card'));
    const all = (await Promise.all(cards.map((c) => getInvoices(db, c.id)))).flat();
    const forecast = all.filter(isForecastInvoice);
    expect(forecast.length).toBeGreaterThan(0);
    for (const inv of forecast) {
      expect(inv.referenceMonth > fixtureOpts.referenceDate).toBe(true);
      const items = await getInvoiceItems(db, inv.id);
      expect(items.every((i) => i.status === 'projected')).toBe(true);
    }
  });

  it('fatura padrão nos dados fictícios é a aberta, nunca uma prevista nem paga', async () => {
    const [click] = await db.select().from(accounts).where(eq(accounts.name, 'Itaú Click'));
    const invoices = await getInvoices(db, click!.id);
    const chosen = pickDefaultInvoice(invoices, fixtureOpts.referenceDate);
    expect(chosen).not.toBeNull();
    expect(chosen!.status).toBe('open');
    expect(isForecastInvoice(chosen!)).toBe(false);
    // Itaú Click fecha dia 3 e vence dia 10: em 15/10 a aberta é a que vence em novembro
    expect(chosen!.referenceMonth).toBe('2026-11-01');
  });
});

describe('invoice-summary (funções puras)', () => {
  it('pickDefaultInvoice prefere a aberta mais antiga e ignora previstas', () => {
    const list = [
      invoice({ referenceMonth: '2026-12-01', status: 'open', itemCount: 2, projectedCount: 2 }),
      invoice({ referenceMonth: '2026-11-01', status: 'open' }),
      invoice({ referenceMonth: '2026-10-01', status: 'paid' }),
    ];
    expect(pickDefaultInvoice(list, '2026-10-15')!.referenceMonth).toBe('2026-11-01');
    expect(pickDefaultInvoice([], '2026-10-15')).toBeNull();
  });

  it('pickDefaultInvoice sem aberta usa a fechada a vencer e, por último, a mais recente', () => {
    const closed = [
      invoice({ referenceMonth: '2026-10-01', status: 'paid', dueDate: '2026-10-10' }),
      invoice({ referenceMonth: '2026-11-01', status: 'closed', dueDate: '2026-11-10' }),
    ];
    expect(pickDefaultInvoice(closed, '2026-10-15')!.referenceMonth).toBe('2026-11-01');
    const paid = [
      invoice({ referenceMonth: '2026-09-01', status: 'paid', dueDate: '2026-09-10' }),
      invoice({ referenceMonth: '2026-10-01', status: 'paid', dueDate: '2026-10-10' }),
    ];
    expect(pickDefaultInvoice(paid, '2026-10-15')!.referenceMonth).toBe('2026-10-01');
  });

  it('estorno abate da soma e do subtotal do dia', () => {
    const items = [item('2026-10-02', -5000, 'a'), item('2026-10-02', 1000, 'a'), item('2026-10-01', -250, 'b')];
    expect(sumInvoiceItems(items)).toBe(4250);
    const groups = groupItemsByDate(items);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(groups[1]!.totalCents).toBe(4000);
  });

  it('topCategories agrega no pai e junta o excedente em "Outras"', () => {
    const items = [
      item('2026-10-01', -3000, 'Delivery', 'Alimentação'),
      item('2026-10-01', -2000, 'Mercado', 'Alimentação'),
      item('2026-10-01', -900, 'B'),
      item('2026-10-01', -800, 'C'),
      item('2026-10-01', -700, 'D'),
      item('2026-10-01', -600, 'E'),
      item('2026-10-01', -500, 'F'),
      item('2026-10-01', -400, null),
    ];
    const top = topCategories(items);
    expect(top.map((t) => t.label)).toEqual(['Alimentação', 'B', 'C', 'D', 'E', 'Outras']);
    expect(top[0]!.totalCents).toBe(5000);
    expect(top[5]!.totalCents).toBe(900);
    expect(top.reduce((s, t) => s + t.totalCents, 0)).toBe(sumInvoiceItems(items));
  });

  it('topCategories usa a cor da categoria pai, não a da subcategoria do primeiro item', () => {
    const sub = (date: string, cents: number, name: string, color: string) => ({
      date,
      amountCents: cents,
      category: { id: name, name, color, icon: 'tag', parentName: 'Alimentação' },
    });
    const items = [sub('2026-10-01', -100, 'Café', '#000001'), sub('2026-10-02', -200, 'Mercado', '#000002')];
    expect(topCategories(items, new Map([['Alimentação', '#F97316']]))[0]!.color).toBe('#F97316');
    // Sem o mapa, cai na cor do item
    expect(topCategories(items)[0]!.color).toBe('#000001');
  });

  it('fillInstallmentMonths devolve 12 meses a partir do mês atual', () => {
    const months = fillInstallmentMonths([{ month: '2026-12-01', totalCents: 500, count: 1 }], '2026-10-15');
    expect(months).toHaveLength(12);
    expect(months[0]!.month).toBe('2026-10-01');
    expect(months[11]!.month).toBe('2027-09-01');
    expect(months[2]).toEqual({ month: '2026-12-01', totalCents: 500, count: 1 });
    expect(months[1]!.totalCents).toBe(0);
  });

  it('formatMonthShort usa o mês abreviado em pt-BR', () => {
    expect(formatMonthShort('2026-10-01')).toBe('out/26');
  });
});
