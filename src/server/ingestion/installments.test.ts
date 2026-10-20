import { describe, expect, it } from 'vitest';
import { parseInstallment } from './installments';

describe('installments ingestion parser', () => {
  it('reconhece casos obrigatórios da especificação', () => {
    expect(parseInstallment('MAGAZINE LUIZA PARC 03/10')).toEqual({
      number: 3,
      total: 10,
      base: 'MAGAZINE LUIZA',
    });

    expect(parseInstallment('Notebook Dell 3/10')).toEqual({
      number: 3,
      total: 10,
      base: 'Notebook Dell',
    });

    expect(parseInstallment('LOJA X PARCELA 1 DE 12')).toEqual({
      number: 1,
      total: 12,
      base: 'LOJA X',
    });

    expect(parseInstallment('PAGAMENTO 10/2026')).toBeNull();
    expect(parseInstallment('UBER *TRIP')).toBeNull();
    expect(parseInstallment('LOJA 13/12')).toBeNull();
  });

  it('reconhece variações com traço e parcelas no final', () => {
    expect(parseInstallment('LOJA - Parcela 3/10')).toEqual({
      number: 3,
      total: 10,
      base: 'LOJA',
    });

    expect(parseInstallment('LOJA 03/10')).toEqual({
      number: 3,
      total: 10,
      base: 'LOJA',
    });

    expect(parseInstallment('COMPRA EM LOJA 3 DE 10')).toEqual({
      number: 3,
      total: 10,
      base: 'COMPRA EM LOJA',
    });

    expect(parseInstallment('')).toBeNull();
  });
});
