import { describe, expect, it } from 'vitest';
import { computeFreeToSpend, type FreeToSpendEvent } from './free-to-spend';

describe('computeFreeToSpend', () => {
  it('calcula livre para gastar corretamente (saldo - faturas - fixas + receitas)', () => {
    const events: FreeToSpendEvent[] = [
      { date: '2026-10-20', kind: 'invoice', label: 'Fatura Nubank', amountCents: 300000 },
      { date: '2026-10-18', kind: 'fixed_expense', label: 'Aluguel', amountCents: 150000 },
      { date: '2026-10-25', kind: 'income', label: 'Salário', amountCents: 500000 },
    ];

    // Saldo: R$ 10.000,00 (1.000.000 centavos)
    const result = computeFreeToSpend(1000000, events, '2026-10-31');

    // 10.000 - 3.000 - 1.500 + 5.000 = 10.500 (1.050.000 centavos)
    expect(result.balanceCents).toBe(1000000);
    expect(result.invoicesCents).toBe(300000);
    expect(result.fixedExpensesCents).toBe(150000);
    expect(result.incomeCents).toBe(500000);
    expect(result.freeCents).toBe(1050000);
    expect(result.untilDate).toBe('2026-10-31');
  });

  it('permite resultado negativo quando as saídas passam do saldo', () => {
    const events: FreeToSpendEvent[] = [
      { date: '2026-10-20', kind: 'invoice', label: 'Fatura Nubank', amountCents: 300000 },
    ];

    // Saldo: R$ 1.000,00
    const result = computeFreeToSpend(100000, events, '2026-10-31');

    // 1.000 - 3.000 = -2.000
    expect(result.freeCents).toBe(-200000);
  });

  it('ordena os eventos cronologicamente por data', () => {
    const events: FreeToSpendEvent[] = [
      { date: '2026-10-25', kind: 'income', label: 'Salário', amountCents: 500000 },
      { date: '2026-10-10', kind: 'fixed_expense', label: 'Internet', amountCents: 12000 },
      { date: '2026-10-18', kind: 'invoice', label: 'Fatura', amountCents: 200000 },
    ];

    const result = computeFreeToSpend(500000, events, '2026-10-31');

    expect(result.events.map((e) => e.date)).toEqual([
      '2026-10-10',
      '2026-10-18',
      '2026-10-25',
    ]);
  });
});
