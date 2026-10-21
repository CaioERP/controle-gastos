import { describe, expect, it } from 'vitest';
import {
  centsToInput,
  parseQuantityInput,
  quantityToInput,
  splitPercentTenths,
} from './input-format';

describe('parseQuantityInput', () => {
  it('entende pt-BR com milhar e vírgula decimal', () => {
    expect(parseQuantityInput('1.234,5')).toEqual({ ok: true, value: '1234.5' });
    expect(parseQuantityInput('1000')).toEqual({ ok: true, value: '1000' });
    expect(parseQuantityInput('0,00150000')).toEqual({ ok: true, value: '0.0015' });
    expect(parseQuantityInput('1.000.000')).toEqual({ ok: true, value: '1000000' });
    expect(parseQuantityInput('0.015')).toEqual({ ok: true, value: '0.015' });
  });

  it('recusa vazio, zero, texto e mais de 8 casas', () => {
    expect(parseQuantityInput('').ok).toBe(false);
    expect(parseQuantityInput('0,000').ok).toBe(false);
    expect(parseQuantityInput('abc').ok).toBe(false);
    expect(parseQuantityInput('1,123456789').ok).toBe(false);
  });

  it('o valor pré-preenchido na edição volta igual (ida e volta)', () => {
    expect(parseQuantityInput(quantityToInput('1000.00000000'))).toEqual({ ok: true, value: '1000' });
    expect(parseQuantityInput(quantityToInput('1.50000000'))).toEqual({ ok: true, value: '1.5' });
  });
});

describe('centsToInput', () => {
  it('formata centavos sem float', () => {
    expect(centsToInput(123456)).toBe('1234,56');
    expect(centsToInput(5)).toBe('0,05');
    expect(centsToInput(0)).toBe('0,00');
  });
});

describe('splitPercentTenths', () => {
  it('soma exatamente 100,0%', () => {
    // participações 27,84 / 20,97 / 20,46 / 20,07 / 10,66 arredondadas uma a uma dariam 100,1%
    const parts = splitPercentTenths([2150000, 1620000, 1580000, 1550000, 823600]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(splitPercentTenths([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(splitPercentTenths([0, 0])).toEqual([0, 0]);
  });
});
