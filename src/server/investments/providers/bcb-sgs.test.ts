import { describe, expect, it } from 'vitest';
import { fetchBenchmarkSeries, formatDateBR, parseBcbSgsResponse } from './bcb-sgs';

describe('bcb-sgs provider', () => {
  it('trata 404 "Value(s) not found" do SGS como intervalo sem pontos', async () => {
    const body =
      '{"erro":{"statusCode":404,"detail":"br.gov.bcb.pec.sgs.comum.excecoes.SGSNegocioException: Value(s) not found"}}';
    const fetchFn = (async () => new Response(body, { status: 404 })) as unknown as typeof fetch;
    await expect(fetchBenchmarkSeries('selic', '2026-10-17', '2026-10-18', { fetchFn })).resolves.toEqual([]);
  });

  it('converte datas ISO para DD/MM/YYYY', () => {
    expect(formatDateBR('2026-10-20')).toBe('20/10/2026');
  });

  it('parseia série de taxa diária (CDI / Selic) em micro-unidades', () => {
    const raw = [
      { data: '17/10/2026', valor: '0.040123' },
      { data: '18/10/2026', valor: '0,040200' },
    ];

    const res = parseBcbSgsResponse('cdi', raw);
    expect(res).toEqual([
      { benchmark: 'cdi', date: '2026-10-17', valueMicros: 40123 },
      { benchmark: 'cdi', date: '2026-10-18', valueMicros: 40200 },
    ]);
  });

  it('parseia série IPCA forçando o dia para 01', () => {
    const raw = [
      { data: '15/09/2026', valor: '0.44' },
      { data: '15/10/2026', valor: '0.56' },
    ];

    const res = parseBcbSgsResponse('ipca', raw);
    expect(res).toEqual([
      { benchmark: 'ipca', date: '2026-09-01', valueMicros: 440000 },
      { benchmark: 'ipca', date: '2026-10-01', valueMicros: 560000 },
    ]);
  });

  it('parseia série de pontos do Ibovespa em centésimos (pontos * 100)', () => {
    const raw = [
      { data: '18/10/2026', valor: '131250.45' },
      { data: '19/10/2026', valor: '132100,00' },
    ];

    const res = parseBcbSgsResponse('ibov', raw);
    expect(res).toEqual([
      { benchmark: 'ibov', date: '2026-10-18', valueMicros: 13125045 },
      { benchmark: 'ibov', date: '2026-10-19', valueMicros: 13210000 },
    ]);
  });
});
