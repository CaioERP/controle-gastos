import { describe, expect, it } from 'vitest';
import { toDonutSlices } from './donut-slices';
import type { BreakdownItem } from '@/server/queries/breakdown';
import type { TxFilters } from '@/server/domain/filters';

describe('toDonutSlices', () => {
  const dummyCategories: BreakdownItem[] = Array.from({ length: 9 }, (_, i) => ({
    key: `11111111-1111-4111-8111-11111111111${i}`,
    label: `Categoria ${i + 1}`,
    color: `#11223${i}`,
    totalCents: (10 - i) * 1000,
    count: 2,
  }));

  const filters: TxFilters = {
    from: '2026-10-01',
    to: '2026-10-31',
    accountIds: ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'],
  };

  it('9 categorias com limite 5 dão 6 fatias, a última "Outras" com grouped de 4 itens e sem link', () => {
    const slices = toDonutSlices({
      items: dummyCategories,
      dimension: 'categoria',
      filters,
      limit: 5,
    });

    expect(slices).toHaveLength(6);

    // As primeiras 5 fatias têm links
    for (let i = 0; i < 5; i++) {
      expect(slices[i]!.key).toBe(dummyCategories[i]!.key);
      expect(slices[i]!.href).not.toBeNull();
      expect(slices[i]!.isOthers).toBeFalsy();
    }

    // A última fatia é "Outras"
    const lastSlice = slices[5]!;
    expect(lastSlice.key).toBe('outras');
    expect(lastSlice.label).toBe('Outras');
    expect(lastSlice.isOthers).toBe(true);
    expect(lastSlice.href).toBeNull();
    expect(lastSlice.grouped).toHaveLength(4);
    expect(lastSlice.grouped?.map((g) => g.key)).toEqual([
      dummyCategories[5]!.key,
      dummyCategories[6]!.key,
      dummyCategories[7]!.key,
      dummyCategories[8]!.key,
    ]);
  });

  it('o link da fatia leva os accountIds dos filtros recebidos', () => {
    const slices = toDonutSlices({
      items: dummyCategories,
      dimension: 'categoria',
      filters,
      limit: 5,
    });

    const firstHref = slices[0]!.href;
    expect(firstHref).not.toBeNull();
    expect(firstHref).toContain('contas=33333333-3333-4333-8333-333333333333%2C44444444-4444-4444-8444-444444444444');
    expect(firstHref).toContain(`cat=${dummyCategories[0]!.key}`);
  });
});
