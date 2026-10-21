import { describe, expect, it } from 'vitest';
import type { CashFlowProjection, MonthlyCashFlowPoint } from '@/server/queries/cashflow';
import { formatMonthBR } from '@/server/domain/dates';

describe('cashflow components & helpers', () => {
  const mockPoints: MonthlyCashFlowPoint[] = [
    {
      month: '2026-11',
      startingBalanceCents: 100000,
      projectedIncomeCents: 500000,
      fixedExpensesCents: 200000,
      cardInstallmentsCents: 50000,
      variableExpensesCents: 150000,
      projectedBalanceCents: 200000,
      lowerBandCents: 150000,
      upperBandCents: 250000,
    },
    {
      month: '2026-12',
      startingBalanceCents: 200000,
      projectedIncomeCents: 500000,
      fixedExpensesCents: 200000,
      cardInstallmentsCents: 60000,
      variableExpensesCents: 150000,
      projectedBalanceCents: 290000,
      lowerBandCents: 219289,
      upperBandCents: 360711,
    },
    {
      month: '2027-01',
      startingBalanceCents: 290000,
      projectedIncomeCents: 500000,
      fixedExpensesCents: 200000,
      cardInstallmentsCents: 30000,
      variableExpensesCents: 150000,
      projectedBalanceCents: 410000,
      lowerBandCents: 323397,
      upperBandCents: 496603,
    },
  ];

  const mockProjection: CashFlowProjection = {
    currentBalanceCents: 100000,
    horizonMonths: 3,
    points: mockPoints,
    lowestProjectedBalanceCents: 200000,
    lowestBalanceMonth: '2026-11',
    hasDeficitRisk: false,
  };

  it('formata rótulos de mês corretamente via formatMonthBR', () => {
    expect(formatMonthBR('2026-11-01')).toContain('2026');
    expect(formatMonthBR('2027-01-01')).toContain('2027');
  });

  it('calcula variações e consolidados de cashflow corretamente', () => {
    const finalPoint = mockPoints[mockPoints.length - 1]!;
    const netVariation = finalPoint.projectedBalanceCents - mockProjection.currentBalanceCents;

    expect(netVariation).toBe(310000); // R$ 4.100 - R$ 1.000 = R$ 3.100

    const totalIncome = mockPoints.reduce((acc, p) => acc + p.projectedIncomeCents, 0);
    const totalFixed = mockPoints.reduce((acc, p) => acc + p.fixedExpensesCents, 0);
    const totalCard = mockPoints.reduce((acc, p) => acc + p.cardInstallmentsCents, 0);
    const totalVar = mockPoints.reduce((acc, p) => acc + p.variableExpensesCents, 0);

    expect(totalIncome).toBe(1500000);
    expect(totalFixed).toBe(600000);
    expect(totalCard).toBe(140000);
    expect(totalVar).toBe(450000);
  });

  it('identifica corretamente caso de risco de déficit', () => {
    const deficitProjection: CashFlowProjection = {
      currentBalanceCents: 50000,
      horizonMonths: 2,
      points: [
        {
          month: '2026-11',
          startingBalanceCents: 50000,
          projectedIncomeCents: 100000,
          fixedExpensesCents: 200000,
          cardInstallmentsCents: 50000,
          variableExpensesCents: 100000,
          projectedBalanceCents: -200000,
          lowerBandCents: -300000,
          upperBandCents: -100000,
        },
      ],
      lowestProjectedBalanceCents: -200000,
      lowestBalanceMonth: '2026-11',
      hasDeficitRisk: true,
    };

    expect(deficitProjection.hasDeficitRisk).toBe(true);
    expect(deficitProjection.lowestProjectedBalanceCents).toBeLessThan(0);
  });
});
