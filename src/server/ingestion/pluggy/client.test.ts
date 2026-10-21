import { describe, expect, it } from 'vitest';
import type { PluggyClient } from 'pluggy-sdk';
import { RealPluggyApi } from './client';

describe('RealPluggyApi.fetchInvestments', () => {
  it('percorre todas as páginas de GET /investments', async () => {
    const all = Array.from({ length: 25 }, (_, i) => ({
      id: `inv-${i}`,
      itemId: 'item-1',
      name: `CDB ${i}`,
      type: 'FIXED_INCOME',
      balance: 100,
    }));
    // Imita a API: 20 por página quando pageSize não é informado
    const fakeClient = {
      fetchInvestments: async (
        _itemId: string,
        _type?: unknown,
        opts: { page?: number; pageSize?: number } = {},
      ) => {
        const size = Math.min(opts.pageSize ?? 20, 10);
        const page = opts.page ?? 1;
        return {
          results: all.slice((page - 1) * size, page * size),
          page,
          total: all.length,
          totalPages: Math.ceil(all.length / size),
        };
      },
    } as unknown as PluggyClient;

    const res = await new RealPluggyApi(fakeClient).fetchInvestments('item-1');

    expect(res).toHaveLength(25);
    expect(new Set(res.map((r) => r.id)).size).toBe(25);
  });
});
