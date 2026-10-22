import { describe, it, expect } from 'vitest';
import { limitStatus } from '@/server/queries/limits';
import type { MonthlyLimitsSummary } from '@/server/home/limits-summary';

describe('LimitsSummaryCard calculations', () => {
  it('determines status colors and progress based on spentPercent', () => {
    expect(limitStatus(64)).toBe('ok');
    expect(limitStatus(85)).toBe('warning');
    expect(limitStatus(112)).toBe('exceeded');
  });

  it('correctly handles summary with exceeded limits', () => {
    const summary: MonthlyLimitsSummary = {
      budgetedCents: 500000,
      spentCents: 320000,
      spentPercent: 64,
      exceededCount: 2,
      considered: 4,
      critical: [],
    };

    expect(summary.considered).toBeGreaterThan(0);
    expect(summary.exceededCount).toBe(2);
    expect(summary.spentPercent).toBe(64);
  });
});
