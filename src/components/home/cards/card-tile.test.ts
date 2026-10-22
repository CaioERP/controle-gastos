import { describe, it, expect } from 'vitest';
import type { CardTileAccount } from './card-tile';

describe('CardTile logic', () => {
  it('calculates used limit and percentage when limit and available are present', () => {
    const account: CardTileAccount = {
      id: 'acc-1',
      name: 'Cartão Nubank',
      displayName: 'Nubank Roxinho',
      institution: { id: 'inst-1', name: 'Nubank', color: '#8A05BE' },
      credit: {
        limitCents: 500000, // R$ 5.000,00
        availableCents: 200000, // R$ 2.000,00
        closingDay: 5,
        dueDay: 12,
        openInvoice: {
          id: 'inv-1',
          totalCents: 150000,
          dueDate: '2026-10-12',
          status: 'open',
        },
      },
    };

    const limit = account.credit!.limitCents!;
    const available = account.credit!.availableCents!;
    const usedCents = Math.max(0, limit - available);
    const percentUsed = Math.min(100, Math.max(0, Math.round((usedCents / limit) * 100)));

    expect(usedCents).toBe(300000);
    expect(percentUsed).toBe(60);
  });

  it('detects when limit information is missing', () => {
    const accountWithoutLimit: CardTileAccount = {
      id: 'acc-2',
      name: 'Cartão Sem Limite',
      displayName: null,
      institution: { id: 'inst-2', name: 'Inter', color: '#FF7A00' },
      credit: {
        limitCents: null,
        availableCents: null,
        closingDay: 1,
        dueDay: 10,
        openInvoice: null,
      },
    };

    const hasLimitInfo =
      accountWithoutLimit.credit?.limitCents !== null &&
      accountWithoutLimit.credit?.limitCents !== undefined &&
      accountWithoutLimit.credit.limitCents > 0 &&
      accountWithoutLimit.credit?.availableCents !== null &&
      accountWithoutLimit.credit?.availableCents !== undefined;

    expect(hasLimitInfo).toBe(false);
  });
});
