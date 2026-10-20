import { describe, expect, it } from 'vitest';
import { parseBrapiResponse } from './brapi';

describe('brapi provider', () => {
  it('parseia cotação com regularMarketPrice e ISO time', () => {
    const raw = {
      results: [
        {
          symbol: 'PETR4',
          shortName: 'PETROBRAS PN',
          regularMarketPrice: 41.18,
          regularMarketTime: '2026-10-20T17:00:00.000Z',
        },
      ],
    };

    const res = parseBrapiResponse('PETR4', raw);
    expect(res).toEqual({
      ticker: 'PETR4',
      priceCents: 4118,
      date: '2026-10-20',
    });
  });

  it('usa fallbackDate quando regularMarketTime não estiver presente', () => {
    const raw = {
      results: [
        {
          symbol: 'VALE3',
          regularMarketPrice: 65.5,
        },
      ],
    };

    const res = parseBrapiResponse('VALE3', raw, '2026-10-15');
    expect(res).toEqual({
      ticker: 'VALE3',
      priceCents: 6550,
      date: '2026-10-15',
    });
  });

  it('converte timestamp numérico para YYYY-MM-DD', () => {
    const raw = {
      results: [
        {
          symbol: 'ITUB4',
          regularMarketPrice: 34.2,
          regularMarketTime: 1776700800, // seconds
        },
      ],
    };

    const res = parseBrapiResponse('ITUB4', raw);
    expect(res).not.toBeNull();
    expect(res?.priceCents).toBe(3420);
    expect(res?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('retorna null se resultado estiver vazio ou preço for inválido', () => {
    expect(parseBrapiResponse('PETR4', { results: [] })).toBeNull();
    expect(parseBrapiResponse('PETR4', { results: [{ regularMarketPrice: null }] })).toBeNull();
    expect(parseBrapiResponse('PETR4', { results: [{ regularMarketPrice: 0 }] })).toBeNull();
    expect(parseBrapiResponse('PETR4', {})).toBeNull();
  });
});
