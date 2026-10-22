import { describe, expect, it } from 'vitest';
import { rebuildDailyBalance } from './cash-accounts';

describe('rebuildDailyBalance', () => {
  it('reconstrói saldo histórico voltando no tempo: saldo hoje 1.000,00 e +500,00 ontem resulta em 500,00 anteontem', () => {
    const today = '2026-10-03';
    const from = '2026-10-01';
    const todayBalanceCents = 100000; // R$ 1.000,00

    // Ontem (02/10) houve entrada de +500,00 (+50.000 centavos)
    const dailyNet = new Map<string, number>([
      ['2026-10-02', 50000],
    ]);

    const points = rebuildDailyBalance(todayBalanceCents, dailyNet, from, today);

    expect(points).toHaveLength(3);

    const anteontem = points.find((p) => p.date === '2026-10-01');
    const ontem = points.find((p) => p.date === '2026-10-02');
    const hoje = points.find((p) => p.date === '2026-10-03');

    // Hoje: 1.000,00
    expect(hoje?.balanceCents).toBe(100000);
    expect(hoje?.projected).toBe(false);

    // Ontem (sem movimento em 03/10): 1.000,00
    expect(ontem?.balanceCents).toBe(100000);

    // Anteontem (ontem teve +500,00): 1.000,00 - 500,00 = 500,00
    expect(anteontem?.balanceCents).toBe(50000);
  });

  it('repete o saldo em dias consecutivos sem movimento', () => {
    const today = '2026-10-05';
    const from = '2026-10-01';
    const todayBalanceCents = 200000;

    // Apenas movimento no dia 04
    const dailyNet = new Map<string, number>([
      ['2026-10-04', -30000], // saída de 300,00 no dia 4
    ]);

    const points = rebuildDailyBalance(todayBalanceCents, dailyNet, from, today);

    // Dia 5: 2.000
    expect(points.find((p) => p.date === '2026-10-05')?.balanceCents).toBe(200000);
    // Dia 4: 2.000 (sem movimento no dia 5)
    expect(points.find((p) => p.date === '2026-10-04')?.balanceCents).toBe(200000);
    // Dia 3: 2.000 - (-300) = 2.300
    expect(points.find((p) => p.date === '2026-10-03')?.balanceCents).toBe(230000);
    // Dia 2: sem movimento, repete 2.300
    expect(points.find((p) => p.date === '2026-10-02')?.balanceCents).toBe(230000);
    // Dia 1: sem movimento, repete 2.300
    expect(points.find((p) => p.date === '2026-10-01')?.balanceCents).toBe(230000);
  });

  it('devolve exatamente um ponto por dia do intervalo', () => {
    const from = '2026-07-01';
    const today = '2026-07-31';
    const points = rebuildDailyBalance(100000, new Map(), from, today);

    // Julho tem 31 dias
    expect(points).toHaveLength(31);
    expect(points[0]?.date).toBe('2026-07-01');
    expect(points[30]?.date).toBe('2026-07-31');
    for (const p of points) {
      expect(p.projected).toBe(false);
      expect(p.balanceCents).toBe(100000);
    }
  });
});
