import { describe, expect, it } from 'vitest';
import { decidePaymentMethod } from './payment-method';

describe('payment-method decision engine', () => {
  it('Regra 1: tarifas, juros, iof e anuidades viram account_fee', () => {
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'IOF S/ SALDO DEVEDOR',
        installmentTotal: null,
      })
    ).toBe('account_fee');

    expect(
      decidePaymentMethod({
        accountType: 'credit_card',
        sourcePaymentMethod: null,
        description: 'TARIFA MENSALIDADE DO PACOTE DE SERVICOS',
        installmentTotal: null,
      })
    ).toBe('account_fee');

    expect(
      decidePaymentMethod({
        accountType: 'credit_card',
        sourcePaymentMethod: null,
        description: 'COBRANCA ANUIDADE DIFERENCIADA',
        installmentTotal: 3,
      })
    ).toBe('account_fee');
  });

  it('Regra 2: cartão de crédito classifica à vista ou parcelado', () => {
    expect(
      decidePaymentMethod({
        accountType: 'credit_card',
        sourcePaymentMethod: null,
        description: 'MAGAZINE LUIZA 03/10',
        installmentTotal: 10,
      })
    ).toBe('credit_card_installment');

    expect(
      decidePaymentMethod({
        accountType: 'credit_card',
        sourcePaymentMethod: null,
        description: 'UBER *TRIP',
        installmentTotal: null,
      })
    ).toBe('credit_card_single');
  });

  it('Regra 3: respeita sourcePaymentMethod da fonte quando aplicável', () => {
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: 'PIX',
        description: 'TRANSFERENCIA RECEBIDA',
        installmentTotal: null,
      })
    ).toBe('pix');

    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: 'TED',
        description: 'ENVIO ELETRONICO',
        installmentTotal: null,
      })
    ).toBe('ted_doc');

    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: 'BOLETO',
        description: 'TITULO ELETRONICO',
        installmentTotal: null,
      })
    ).toBe('boleto');
  });

  it('Regra 4: padrões na descrição para conta corrente', () => {
    // pix
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'PIX TRANSF JOAO DA SILVA',
        installmentTotal: null,
      })
    ).toBe('pix');

    // ted_doc
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'TED INTERNET 341.0001',
        installmentTotal: null,
      })
    ).toBe('ted_doc');
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'TRANSFERENCIA ENTRE CONTAS',
        installmentTotal: null,
      })
    ).toBe('ted_doc');

    // boleto
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'PAGTO TITULO BANCO DO BRASIL',
        installmentTotal: null,
      })
    ).toBe('boleto');
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'BOLETO COBRANCA BRADESCO',
        installmentTotal: null,
      })
    ).toBe('boleto');

    // direct_debit
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'DEBITO AUTOMATICO SABESP',
        installmentTotal: null,
      })
    ).toBe('direct_debit');
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'DEB AUT ENEL',
        installmentTotal: null,
      })
    ).toBe('direct_debit');

    // debit_card
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'COMPRA NO DEBITO PADARIA',
        installmentTotal: null,
      })
    ).toBe('debit_card');
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'DEBITO VISA SUPERMERCADO',
        installmentTotal: null,
      })
    ).toBe('debit_card');
  });

  it('Regra 5: fallback para other', () => {
    expect(
      decidePaymentMethod({
        accountType: 'checking',
        sourcePaymentMethod: null,
        description: 'LANCAMENTO DIVERSO REGISTRO',
        installmentTotal: null,
      })
    ).toBe('other');

    expect(
      decidePaymentMethod({
        accountType: 'savings',
        sourcePaymentMethod: null,
        description: 'CREDITO DE RENDIMENTOS',
        installmentTotal: null,
      })
    ).toBe('other');
  });
});
