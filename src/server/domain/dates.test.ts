import { describe, expect, it } from 'vitest';
import { addDaysISO, addMonthsISO, formatDateBR, formatMonthBR, monthEnd, monthStart, today } from './dates';

describe('dates', () => {
  it('calcula fim de mês corretamente, inclusive bissexto', () => {
    expect(monthEnd('2024-02-10')).toBe('2024-02-29');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
  });

  it('adiciona meses mantendo formato ISO', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('adiciona dias mantendo formato ISO', () => {
    expect(addDaysISO('2026-10-01', 5)).toBe('2026-10-06');
  });

  it('calcula início do mês', () => {
    expect(monthStart('2026-10-25')).toBe('2026-10-01');
  });

  it('formata data e mês em pt-BR', () => {
    expect(formatDateBR('2026-10-05')).toBe('05/10/2026');
    expect(formatMonthBR('2026-10-01')).toMatch(/out.*2026/);
  });

  it('retorna data de hoje em formato YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
