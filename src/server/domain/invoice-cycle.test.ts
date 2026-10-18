import { describe, expect, it } from 'vitest';
import { getInvoiceCycle } from './invoice-cycle';

describe('getInvoiceCycle', () => {
  it('fechamento dia 3, vencimento dia 10', () => {
    expect(getInvoiceCycle('2026-10-02', 3, 10)).toEqual({
      closingDate: '2026-10-03',
      dueDate: '2026-10-10',
      referenceMonth: '2026-10-01',
    });

    expect(getInvoiceCycle('2026-10-03', 3, 10)).toEqual({
      closingDate: '2026-10-03',
      dueDate: '2026-10-10',
      referenceMonth: '2026-10-01',
    });

    expect(getInvoiceCycle('2026-10-04', 3, 10)).toEqual({
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
      referenceMonth: '2026-11-01',
    });
  });

  it('fechamento dia 25 e vencimento dia 5', () => {
    expect(getInvoiceCycle('2026-10-20', 25, 5)).toEqual({
      closingDate: '2026-10-25',
      dueDate: '2026-11-05',
      referenceMonth: '2026-11-01',
    });
  });

  it('fechamento dia 31 em fevereiro ajusta para último dia do mês', () => {
    const cycle = getInvoiceCycle('2026-02-15', 31, 10);
    expect(cycle.closingDate).toBe('2026-02-28');
  });
});
