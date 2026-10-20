import { describe, expect, it } from 'vitest';
import { extractMerchantName } from './merchant';

describe('merchant extraction', () => {
  it('casos obrigatórios da especificação', () => {
    // IFD*IFOOD → Ifood
    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'IFD*IFOOD',
        paymentMethod: 'debit_card',
      })
    ).toBe('Ifood');

    // UBER *TRIP → Uber
    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'UBER *TRIP',
        paymentMethod: 'credit_card_single',
      })
    ).toBe('Uber');

    // PAO DE ACUCAR 1234 → Pao De Acucar
    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'PAO DE ACUCAR 1234',
        paymentMethod: 'debit_card',
      })
    ).toBe('Pao De Acucar');

    // NETFLIX.COM → Netflix.com
    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'NETFLIX.COM',
        paymentMethod: 'credit_card_single',
      })
    ).toBe('Netflix.com');

    // Pix → null
    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'PIX TRANSF JOAO',
        paymentMethod: 'pix',
      })
    ).toBeNull();
  });

  it('retorna null para ted_doc e account_fee', () => {
    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'TED INTERNET',
        paymentMethod: 'ted_doc',
      })
    ).toBeNull();

    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'IOF S/ SALDO',
        paymentMethod: 'account_fee',
      })
    ).toBeNull();
  });

  it('respeita sourceMerchant se informado', () => {
    expect(
      extractMerchantName({
        sourceMerchant: 'PADARIA REAL LTDA',
        description: 'COMPRA CARTAO 1234',
        paymentMethod: 'credit_card_single',
      })
    ).toBe('Padaria Real Ltda');
  });

  it('trata outros intermediadores e sufixos de UF', () => {
    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'MP*MERCADO LIVRE SP',
        paymentMethod: 'credit_card_single',
      })
    ).toBe('Mercado Livre');

    expect(
      extractMerchantName({
        sourceMerchant: null,
        description: 'PAG*PadariaEstrela RJ',
        paymentMethod: 'debit_card',
      })
    ).toBe('Padariaestrela');
  });
});
