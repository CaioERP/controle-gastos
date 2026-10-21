import { describe, expect, it } from 'vitest';
import { fetchB3Quotes, parseBrapiResponse } from './brapi';

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

  it('usa a data de São Paulo quando regularMarketTime já virou o dia em UTC', () => {
    // Formato real da brapi: 01:15 UTC de 21/10 = 22:15 de 20/10 em Brasília.
    const raw = {
      results: [
        { symbol: 'PETR4', regularMarketPrice: 58.21, regularMarketTime: '2026-10-21T01:15:26.000Z' },
      ],
    };
    expect(parseBrapiResponse('PETR4', raw)?.date).toBe('2026-10-20');
  });

  it('para no primeiro 429 e devolve o erro em vez de engolir', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response('{"error":true}', { status: 429 });
    }) as unknown as typeof fetch;

    await expect(
      fetchB3Quotes(['PETR4', 'VALE3', 'HGLG11'], { token: 'x', fetchFn, today: '2026-10-20' }),
    ).rejects.toThrow('PETR4: HTTP 429');
    expect(calls).toBe(1);
  });

  it('retorna null se resultado estiver vazio ou preço for inválido', () => {
    expect(parseBrapiResponse('PETR4', { results: [] })).toBeNull();
    expect(parseBrapiResponse('PETR4', { results: [{ regularMarketPrice: null }] })).toBeNull();
    expect(parseBrapiResponse('PETR4', { results: [{ regularMarketPrice: 0 }] })).toBeNull();
    expect(parseBrapiResponse('PETR4', {})).toBeNull();
  });
});
