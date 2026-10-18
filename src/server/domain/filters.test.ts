import { describe, expect, it } from 'vitest';
import { defaultFilters, txFiltersSchema } from './filters';

describe('filters', () => {
  it('aceita filtro válido', () => {
    const valid = { from: '2026-10-01', to: '2026-10-31', basis: 'accrual' as const };
    expect(txFiltersSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejeita from > to', () => {
    expect(() => txFiltersSchema.parse({ from: '2026-10-31', to: '2026-10-01' })).toThrow();
  });

  it('rejeita data sem zeros à esquerda', () => {
    expect(() => txFiltersSchema.parse({ from: '2026-1-5', to: '2026-10-31' })).toThrow();
  });

  it('gera filtros padrão para data informada', () => {
    const filters = defaultFilters('2026-10-15');
    expect(filters.from).toBe('2026-10-01');
    expect(filters.to).toBe('2026-10-31');
    expect(filters.basis).toBe('accrual');
    expect(filters.kinds).toEqual(['expense', 'income', 'refund']);
  });
});
