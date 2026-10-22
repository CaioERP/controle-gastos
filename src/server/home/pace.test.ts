import { describe, expect, it } from 'vitest';
import { buildPaceSeries } from './pace';

describe('buildPaceSeries', () => {
  it('repete o último acumulado anterior quando o mês atual tem 31 dias e o anterior tinha 30', () => {
    // Anterior com 30 dias, somando 100 por dia (total 3.000)
    const previousDaily = new Map<number, number>();
    for (let d = 1; d <= 30; d++) {
      previousDaily.set(d, 100);
    }

    const currentDaily = new Map<number, number>([
      [1, 150],
      [2, 200],
    ]);

    const series = buildPaceSeries({
      currentDaily,
      previousDaily,
      daysInMonth: 31,
      todayDay: 15,
    });

    expect(series).toHaveLength(31);

    // Dia 30: 30 * 100 = 3000
    const day30 = series.find((p) => p.day === 30);
    expect(day30?.previousCents).toBe(3000);

    // Dia 31: não existia no anterior, repete o acumulado do dia 30 (3000)
    const day31 = series.find((p) => p.day === 31);
    expect(day31?.previousCents).toBe(3000);
  });

  it('define currentCents como null para dias depois de todayDay', () => {
    const currentDaily = new Map<number, number>([
      [1, 100],
      [2, 100],
      [3, 100],
    ]);
    const previousDaily = new Map<number, number>();

    const series = buildPaceSeries({
      currentDaily,
      previousDaily,
      daysInMonth: 30,
      todayDay: 2,
    });

    const day1 = series.find((p) => p.day === 1);
    const day2 = series.find((p) => p.day === 2);
    const day3 = series.find((p) => p.day === 3);

    expect(day1?.currentCents).toBe(100);
    expect(day2?.currentCents).toBe(200);
    expect(day3?.currentCents).toBeNull();
  });

  it('mantém o acumulado em dias sem gasto', () => {
    const currentDaily = new Map<number, number>([
      [1, 100],
      // dia 2 sem gasto
      [3, 50],
    ]);
    const previousDaily = new Map<number, number>([
      [1, 80],
      // dia 2 sem gasto
      [3, 70],
    ]);

    const series = buildPaceSeries({
      currentDaily,
      previousDaily,
      daysInMonth: 5,
      todayDay: 3,
    });

    const day1 = series.find((p) => p.day === 1);
    const day2 = series.find((p) => p.day === 2);
    const day3 = series.find((p) => p.day === 3);

    expect(day1?.currentCents).toBe(100);
    expect(day1?.previousCents).toBe(80);

    // Dia 2 mantém acumulado do dia 1
    expect(day2?.currentCents).toBe(100);
    expect(day2?.previousCents).toBe(80);

    // Dia 3 soma gasto novo
    expect(day3?.currentCents).toBe(150);
    expect(day3?.previousCents).toBe(150);
  });
});
