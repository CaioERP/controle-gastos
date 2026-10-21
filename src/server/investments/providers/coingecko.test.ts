import { describe, expect, it } from 'vitest';
import { parseCoinGeckoResponse } from './coingecko';

describe('coingecko provider', () => {
  it('parseia cotações em BRL', () => {
    const raw = {
      bitcoin: { brl: 375420.5 },
      ethereum: { brl: 14500.0 },
      solana: { brl: null },
    };

    const res = parseCoinGeckoResponse(raw, '2026-10-20');
    expect(res).toEqual([
      { ticker: 'bitcoin', priceCents: 37542050, date: '2026-10-20' },
      { ticker: 'ethereum', priceCents: 1450000, date: '2026-10-20' },
    ]);
  });

  it('ignora moeda cujo preço arredonda para 0 centavos', () => {
    // Formato real do /simple/price para moedas baratas (notação científica).
    const res = parseCoinGeckoResponse(
      { bitcoin: { brl: 415514 }, 'shiba-inu': { brl: 2.569e-5 } },
      '2026-10-20',
    );
    expect(res).toEqual([{ ticker: 'bitcoin', priceCents: 41551400, date: '2026-10-20' }]);
  });

  it('retorna array vazio para resposta vazia ou inválida', () => {
    expect(parseCoinGeckoResponse({})).toEqual([]);
    expect(parseCoinGeckoResponse(null)).toEqual([]);
    expect(parseCoinGeckoResponse('invalid')).toEqual([]);
  });
});
