import { describe, expect, it } from 'vitest';
import {
  chainTwrReturns,
  compoundBenchmarkRates,
  computeModifiedDietzMonthReturn,
} from './returns';

describe('returns & TWR calculations (A3-03)', () => {
  it('calcula Modified Dietz com aporte no meio do mês sem inflar falsamente o retorno', () => {
    // 30 dias em abril, aporte dia 15
    // V0 = 1.000.000 (R$ 10.000,00)
    // Aporte dia 15 = 200.000 (R$ 2.000,00) -> peso = (30 - 15 + 0.5) / 30 = 15.5 / 30 = 0.51666...
    // V1 = 1.255.000 (R$ 12.550,00) -> ganho líquido Gm = (1255000 - 1000000) - 200000 = 55000 (R$ 550,00)
    // Capital médio Km = 1000000 + 0.51666... * 200000 = 1.103.333
    // Retorno = 55000 / 1103333 = 0.0498... (~5,00% ou ~498 bps)
    const r = computeModifiedDietzMonthReturn({
      month: '2026-04-01',
      daysInMonth: 30,
      startValueCents: 1000000,
      endValueCents: 1255000,
      flows: [
        {
          date: '2026-04-15',
          type: 'buy',
          amountCents: 200000,
        },
      ],
    });

    const bps = Math.round(r * 10_000);
    expect(bps).toBe(498); // ~5,00% (498 bps)
  });

  it('provento recebido aumenta ganho líquido sem inflar o capital médio ponderado', () => {
    // V0 = 1.000.000, V1 = 1.000.000, Provento = 10.000 (R$ 100,00)
    // Gm = 0 - 0 + 10.000 = 10.000
    // Km = 1.000.000
    // Retorno = 10.000 / 1.000.000 = 1,00% (100 bps)
    const r = computeModifiedDietzMonthReturn({
      month: '2026-04-01',
      daysInMonth: 30,
      startValueCents: 1000000,
      endValueCents: 1000000,
      flows: [
        {
          date: '2026-04-10',
          type: 'income',
          amountCents: 10000,
        },
      ],
    });

    expect(Math.round(r * 10_000)).toBe(100);
  });

  it('imposto retido reduz ganho líquido', () => {
    const r = computeModifiedDietzMonthReturn({
      month: '2026-04-01',
      daysInMonth: 30,
      startValueCents: 1000000,
      endValueCents: 1050000,
      flows: [
        {
          date: '2026-04-20',
          type: 'tax',
          amountCents: 5000, // R$ 50,00 de imposto
        },
      ],
    });

    // Gm = 50.000 - 5.000 = 45.000 -> 4,50%
    expect(Math.round(r * 10_000)).toBe(450);
  });

  it('retorna 0 quando capital médio for zero ou negativo', () => {
    const r = computeModifiedDietzMonthReturn({
      month: '2026-04-01',
      daysInMonth: 30,
      startValueCents: 0,
      endValueCents: 0,
      flows: [],
    });

    expect(r).toBe(0);
  });

  it('encadeia múltiplos meses via TWR (chainTwrReturns)', () => {
    // Mês 1: +10% (0.10)
    // Mês 2: -5% (-0.05)
    // Mês 3: +2% (0.02)
    // Acumulado: (1.10) * (0.95) * (1.02) = 1.0659 -> +6,59% (659 bps)
    const { cumulativeFactor, returnBps } = chainTwrReturns([0.1, -0.05, 0.02]);
    expect(cumulativeFactor).toBeCloseTo(1.0659, 4);
    expect(returnBps).toBe(659);
  });

  it('compõe taxas de CDI em micro-unidades', () => {
    // 2 dias a 0,04% ao dia (40000 micros)
    // (1 + 0.0004)^2 = 1.00080016 -> ~8 bps
    const cdi = compoundBenchmarkRates('cdi', [
      { date: '2026-10-01', valueMicros: 40000 },
      { date: '2026-10-02', valueMicros: 40000 },
    ]);

    expect(cdi.returnBps).toBe(8);
  });

  it('calcula retorno do Ibovespa pela variação de pontos', () => {
    // Começa em 100.000 pontos (10.000.000 centésimos), termina em 110.000 pontos (11.000.000 centésimos)
    // +10,00% (1000 bps)
    const ibov = compoundBenchmarkRates('ibov', [
      { date: '2026-10-01', valueMicros: 10000000 },
      { date: '2026-10-20', valueMicros: 11000000 },
    ]);

    expect(ibov.cumulativeFactor).toBe(1.1);
    expect(ibov.returnBps).toBe(1000);
  });
});
