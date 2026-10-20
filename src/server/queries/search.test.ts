import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import type { Db } from '@/server/db/client';
import { globalSearch } from './search';

const REF = '2026-10-15';

describe('globalSearch', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, { referenceDate: REF, months: 6, seed: 42 });
  });

  it('o nome de um estabelecimento que existe nas fixtures devolve o estabelecimento e pelo menos uma transação', async () => {
    const result = await globalSearch(db, 'iFood');

    expect(result.merchants.length).toBeGreaterThanOrEqual(1);
    expect(result.merchants.some((m) => m.name.toLowerCase() === 'ifood')).toBe(true);

    expect(result.transactions.length).toBeGreaterThanOrEqual(1);
    expect(
      result.transactions.some(
        (t) => t.description.toLowerCase().includes('ifood')
      )
    ).toBe(true);
  });

  it('q de 1 caractere devolve tudo vazio', async () => {
    const result = await globalSearch(db, 'a');
    expect(result.categories).toEqual([]);
    expect(result.merchants).toEqual([]);
    expect(result.transactions).toEqual([]);

    const resultWithSpace = await globalSearch(db, '  a  ');
    expect(resultWithSpace.categories).toEqual([]);
    expect(resultWithSpace.merchants).toEqual([]);
    expect(resultWithSpace.transactions).toEqual([]);
  });

  it('q = "%" não devolve transações', async () => {
    const result = await globalSearch(db, '%');
    expect(result.transactions).toEqual([]);
    expect(result.merchants).toEqual([]);
    expect(result.categories).toEqual([]);

    const resultDouble = await globalSearch(db, '%%');
    expect(resultDouble.transactions).toEqual([]);
  });
});