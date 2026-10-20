import { describe, expect, it } from 'vitest';
import type { PluggyInvestment, PluggyInvestmentTransaction } from '@/server/ingestion/pluggy/api';
import {
  normalizePluggyInvestment,
  normalizePluggyInvestmentTx,
} from './pluggy-normalize';

describe('pluggy-normalize', () => {
  it('normaliza CDB pós-fixado 102% do CDI', () => {
    const raw: PluggyInvestment = {
      id: 'inv-cdb-1',
      itemId: 'item-1',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB Banco Inter 102% CDI',
      balance: 10500,
      amount: 10500,
      amountOriginal: 10000,
      amountProfit: 500,
      rate: 102,
      rateType: 'CDI',
      dueDate: '2027-12-31T00:00:00.000Z',
      date: '2026-10-20',
      institution: { name: 'Banco Inter' },
    };

    const { asset, holding } = normalizePluggyInvestment(raw);

    expect(asset.assetClass).toBe('fixed_income');
    expect(asset.code).toBe('PLUGGY:inv-cdb-1');
    expect(asset.indexer).toBe('cdi');
    expect(asset.rateBps).toBe(10200);
    expect(asset.maturityDate).toBe('2027-12-31');
    expect(asset.isTaxExempt).toBe(false);

    expect(holding.source).toBe('pluggy');
    expect(holding.externalId).toBe('inv-cdb-1');
    expect(holding.currentValueCents).toBe(1050000);
    expect(holding.investedCents).toBe(1000000);
    expect(holding.profitCents).toBe(50000);
  });

  it('normaliza Tesouro Selic', () => {
    const raw: PluggyInvestment = {
      id: 'inv-tesouro-1',
      itemId: 'item-1',
      type: 'FIXED_INCOME',
      subtype: 'TREASURY',
      name: 'Tesouro Selic 2029',
      balance: 15200.5,
      rateType: 'SELIC',
      rate: 100,
      quantity: 1.05,
      value: 14476.67,
      dueDate: '2029-03-01',
    };

    const { asset, holding } = normalizePluggyInvestment(raw);

    expect(asset.assetClass).toBe('treasury');
    expect(asset.code).toBe('TESOURO:TESOURO SELIC 2029:2029-03-01');
    expect(asset.indexer).toBe('selic');
    expect(asset.rateBps).toBe(10000);
    expect(holding.quantity).toBe('1.05000000');
    expect(holding.currentValueCents).toBe(1520050);
  });

  it('normaliza ação PETR4 na B3', () => {
    const raw: PluggyInvestment = {
      id: 'inv-petr4',
      itemId: 'item-1',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      name: 'Petroleo Brasileiro S.A. Petrobras',
      balance: 4118,
      amount: 4118,
      quantity: 100,
      value: 41.18,
      isin: 'BRPETRACNPR6',
    };

    const { asset, holding, quotePriceCents } = normalizePluggyInvestment(raw);

    expect(asset.assetClass).toBe('stocks');
    expect(asset.ticker).toBe('PETR4');
    expect(asset.code).toBe('B3:PETR4');
    expect(asset.isin).toBe('BRPETRACNPR6');
    expect(holding.quantity).toBe('100.00000000');
    expect(holding.currentValueCents).toBe(411800);
    expect(quotePriceCents).toBe(4118);
  });

  it('normaliza FII HGLG11', () => {
    const raw: PluggyInvestment = {
      id: 'inv-hglg11',
      itemId: 'item-1',
      type: 'SECURITY',
      subtype: 'REAL_ESTATE_FUND',
      code: 'HGLG11',
      name: 'CSHG Logística FII',
      balance: 16200,
      quantity: 100,
      value: 162,
    };

    const { asset, holding } = normalizePluggyInvestment(raw);

    expect(asset.assetClass).toBe('fii');
    expect(asset.ticker).toBe('HGLG11');
    expect(asset.code).toBe('B3:HGLG11');
    expect(holding.currentValueCents).toBe(1620000);
  });

  it('normaliza fundo multimercado com CNPJ', () => {
    const raw: PluggyInvestment = {
      id: 'inv-fundo-1',
      itemId: 'item-1',
      type: 'MUTUAL_FUND',
      issuerCNPJ: '29.762.315/0001-26',
      name: 'Kinea Atlas FIM',
      balance: 50000,
      quantity: 320.12345678,
    };

    const { asset, holding } = normalizePluggyInvestment(raw);

    expect(asset.assetClass).toBe('funds');
    expect(asset.code).toBe('CNPJ:29762315000126');
    expect(asset.cnpj).toBe('29762315000126');
    expect(holding.quantity).toBe('320.12345678');
  });

  it('normaliza movimentação de investimento (BUY e DEBIT)', () => {
    const txBuy: PluggyInvestmentTransaction = {
      id: 'tx-1',
      investmentId: 'inv-petr4',
      type: 'BUY',
      date: '2026-10-15',
      amount: 4000,
      quantity: 100,
      value: 40,
      expenses: { brokerageFee: 4.5, incomeTax: 1.2 },
    };

    const normalizedBuy = normalizePluggyInvestmentTx(txBuy);
    expect(normalizedBuy.type).toBe('buy');
    expect(normalizedBuy.amountCents).toBe(400000);
    expect(normalizedBuy.feeCents).toBe(450);
    expect(normalizedBuy.taxCents).toBe(120);
    expect(normalizedBuy.unitPriceCents).toBe(4000);
    expect(normalizedBuy.quantity).toBe('100.00000000');

    const txDebit: PluggyInvestmentTransaction = {
      id: 'tx-2',
      movementType: 'DEBIT',
      date: '2026-10-16',
      netAmount: 2000,
    };
    const normalizedDebit = normalizePluggyInvestmentTx(txDebit);
    expect(normalizedDebit.type).toBe('sell');
    expect(normalizedDebit.amountCents).toBe(200000);
  });
});
