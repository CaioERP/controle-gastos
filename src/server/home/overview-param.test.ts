import { describe, expect, it, vi, beforeAll } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import type { Db } from '@/server/db/client';
import * as accountsQuery from '@/server/queries/accounts';
import { getAttentionItems } from './attention';
import { getFreeToSpend } from './free-to-spend';
import { getCashAccountsTab } from './cash-accounts';

vi.mock('server-only', () => ({}));

describe('funções do Início com overview passado (A6-06)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  it('getRequestAccountsOverview é exportado com cache de requisição', async () => {
    const { getRequestAccountsOverview } = await import('@/server/queries/request-cache');
    expect(typeof getRequestAccountsOverview).toBe('function');
  });

  it('getAttentionItems aceita overview e não consulta getAccountsOverview novamente', async () => {
    const today = '2026-10-24';
    const overview = await accountsQuery.getAccountsOverview(db, { today });

    const withoutOverview = await getAttentionItems(db, { today });
    const withOverview = await getAttentionItems(db, { today, overview });

    expect(withOverview).toEqual(withoutOverview);

    const spy = vi.spyOn(accountsQuery, 'getAccountsOverview');
    spy.mockClear();

    await getAttentionItems(db, { today, overview });
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('getFreeToSpend aceita overview e não consulta getAccountsOverview novamente', async () => {
    const today = '2026-10-24';
    const overview = await accountsQuery.getAccountsOverview(db, { today });

    const withoutOverview = await getFreeToSpend(db, { today });
    const withOverview = await getFreeToSpend(db, { today, overview });

    expect(withOverview).toEqual(withoutOverview);

    const spy = vi.spyOn(accountsQuery, 'getAccountsOverview');
    spy.mockClear();

    await getFreeToSpend(db, { today, overview });
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('getCashAccountsTab aceita overview e não consulta getAccountsOverview (repassando ao getFreeToSpend)', async () => {
    const today = '2026-10-24';
    const period = { from: '2026-10-01', to: '2026-10-31' };
    const overview = await accountsQuery.getAccountsOverview(db, { today });

    const withoutOverview = await getCashAccountsTab(db, period, { today });
    const withOverview = await getCashAccountsTab(db, period, { today, overview });

    expect(withOverview).toEqual(withoutOverview);

    const spy = vi.spyOn(accountsQuery, 'getAccountsOverview');
    spy.mockClear();

    await getCashAccountsTab(db, period, { today, overview });
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});
