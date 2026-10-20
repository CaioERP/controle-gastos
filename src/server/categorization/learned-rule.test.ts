import { describe, expect, it } from 'vitest';
import { descriptionBase, learnedMatchFor } from './learned-rule';

describe('descriptionBase', () => {
  it.each([
    ['MAGAZINE LUIZA PARC 03/10', null, 'MAGAZINE LUIZA'],
    ['Loja X - Parcela 1 de 12', null, 'Loja X'],
    ['Notebook Dell 3/10', 10, 'Notebook Dell'],
    ['Loja 10/10', 10, 'Loja'],
  ])('remove a parcela de "%s"', (description, total, expected) => {
    expect(descriptionBase(description, total)).toBe(expected);
  });

  it.each([
    ['PAGAMENTO 15/10', null],
    ['Pix enviado 10/10', null],
    ['Compra 05/11', null],
    ['LOJA X12/10', 10],
    ['Notebook Dell 3/10', null], // sem a transação estar marcada como parcelada, pode ser data
    ['Notebook Dell 3/12', 10], // total diferente do da transação
    ['LOJA PARC 13/12', null], // parcela maior que o total
    ['Uber', null],
  ])('mantém "%s"', (description, total) => {
    expect(descriptionBase(description, total)).toBe(description);
  });
});

describe('learnedMatchFor', () => {
  it('estabelecimento → merchant equals', () => {
    expect(learnedMatchFor({ description: 'UBER *TRIP', installmentTotal: null, merchantName: 'Uber' })).toEqual({
      matchField: 'merchant',
      matchType: 'equals',
      pattern: 'Uber',
    });
  });

  it('parcela com base longa → starts_with; base curta → equals da descrição inteira', () => {
    expect(learnedMatchFor({ description: 'Notebook Dell 3/10', installmentTotal: 10, merchantName: null })).toEqual({
      matchField: 'description',
      matchType: 'starts_with',
      pattern: 'Notebook Dell',
    });
    expect(learnedMatchFor({ description: 'TV 3/10', installmentTotal: 10, merchantName: null })).toEqual({
      matchField: 'description',
      matchType: 'equals',
      pattern: 'TV 3/10',
    });
  });

  it.each([
    'Compra parcelada PARC 02/05',
    'Mercado Livre PARC 1/3',
    'Pagamento Pix PARC 2/4',
    'SHOPEE BRASIL PARC 1/3',
    'AMAZON MARKETPLACE PARC 2/6',
    'Pagto Boleto Banco PARC 1/2',
    'Loja 123 PARC 3/5',
    'Compra 2026 PARC 1/4',
  ])(
    'parcela com base só de palavras genéricas ("%s") → equals da descrição inteira',
    (description) => {
      expect(learnedMatchFor({ description, installmentTotal: null, merchantName: null })).toEqual({
        matchField: 'description',
        matchType: 'equals',
        pattern: description,
      });
    },
  );

  it.each([
    ['Notebook Dell PARC 03/10', 'Notebook Dell'],
    ['Mercado Livre Fone JBL PARC 1/3', 'Mercado Livre Fone JBL'],
    ['Compra parcelada Geladeira PARC 2/10', 'Compra parcelada Geladeira'],
  ])('parcela com termo distintivo ("%s") continua starts_with', (description, base) => {
    expect(learnedMatchFor({ description, installmentTotal: null, merchantName: null })).toEqual({
      matchField: 'description',
      matchType: 'starts_with',
      pattern: base,
    });
  });

  it('descrição com data no fim → equals da descrição inteira', () => {
    expect(learnedMatchFor({ description: 'Pix enviado 10/10', installmentTotal: null, merchantName: null })).toEqual({
      matchField: 'description',
      matchType: 'equals',
      pattern: 'Pix enviado 10/10',
    });
  });
});
