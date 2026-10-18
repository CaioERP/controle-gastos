import { describe, expect, it } from 'vitest';
import { formatBRL, sumCents, toCents } from './money';

describe('money', () => {
  it('converte valores variados para centavos', () => {
    expect(toCents('1.234,56')).toBe(123456);
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('R$ 10,00')).toBe(1000);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents('-5,5')).toBe(-550);
    expect(toCents(1234.56)).toBe(123456);
  });

  it('lança erro para valor monetário inválido', () => {
    expect(() => toCents('abc')).toThrow('Valor monetário inválido: abc');
  });

  it('formata centavos como moeda BRL', () => {
    expect(formatBRL(123456).replace(/\u00a0/g, ' ')).toBe('R$ 1.234,56');
  });

  it('soma centavos corretamente', () => {
    expect(sumCents([100, 200, 350])).toBe(650);
  });
});
