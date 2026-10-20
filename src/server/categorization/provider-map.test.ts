import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { eq } from 'drizzle-orm';
import { archiveCategory } from '@/server/commands/categories';
import { categories, providerCategoryMap } from '@/server/db/schema';
import { suggestCategorySlug, type ProviderCategorySeed } from './pluggy-category-seed';
import { loadProviderMap, providerMapKey, seedProviderCategoryMap } from './provider-map';

// Um nome por regra de equivalência, para garantir que todos os slugs sugeridos existem no seed de categorias
const PLUGGY_NAMES = [
  'Food delivery',
  'Groceries',
  'Eating out',
  'Taxi and ride-hailing',
  'Gas stations',
  'Public transportation',
  'Parking',
  'Pharmacy',
  'Health insurance',
  'Gyms and fitness centers',
  'Video streaming',
  'Gaming',
  'Rent',
  'Electricity',
  'Water',
  'Telecommunications',
  'Clothing',
  'Electronics',
  'Online shopping',
  'Education',
  'Pet supplies',
  'Airlines',
  'Taxes',
  'Salary',
  'Investment income',
  'Transfers',
  'Credit card payment',
  'Investments',
];

describe('suggestCategorySlug', () => {
  it.each([
    ['Food delivery', 'alimentacao-delivery'],
    ['Eating out', 'alimentacao-restaurante'],
    ['Taxi and ride-hailing', 'transporte-app'],
    ['Taxes', 'impostos-taxas'],
    ['Bank fees', 'impostos-taxas'],
    ['Rent', 'moradia-aluguel'],
    ['Investment income', 'rendimentos'],
  ])('%s → %s', (name, slug) => {
    expect(suggestCategorySlug(name)).toBe(slug);
  });

  it('categorias que indicam natureza são ignoradas (null); desconhecidas retornam undefined', () => {
    expect(suggestCategorySlug('Transfers')).toBeNull();
    expect(suggestCategorySlug('Credit card payment')).toBeNull();
    expect(suggestCategorySlug('Investments')).toBeNull();
    expect(suggestCategorySlug('Categoria que não existe')).toBeUndefined();
  });
});

describe('seedProviderCategoryMap', () => {
  it('todos os slugs sugeridos existem; é idempotente; null vira "ignorar"', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const seed: ProviderCategorySeed[] = PLUGGY_NAMES.map((name, i) => ({
      providerCategoryId: `cat-${i}`,
      providerCategoryName: name,
      categorySlug: suggestCategorySlug(name) ?? null,
    }));

    expect(await seedProviderCategoryMap(db, seed)).toBe(seed.length);
    await seedProviderCategoryMap(db, seed);
    const rows = await db.select().from(providerCategoryMap);
    expect(rows.length).toBe(seed.length);

    const map = await loadProviderMap(db);
    const ignored = seed.filter((s) => s.categorySlug === null).length;
    expect(map.size).toBe(seed.length - ignored);
    expect(map.has(providerMapKey('pluggy', 'cat-0'))).toBe(true);
  });

  it('seed vazio (F0-07 ainda não rodou) não faz nada; slug inexistente é erro', async () => {
    const db = await createTestDb();
    await seedBase(db);
    expect(await seedProviderCategoryMap(db)).toBe(0);
    await expect(
      seedProviderCategoryMap(db, [{ providerCategoryId: 'x', providerCategoryName: 'X', categorySlug: 'nao-existe' }]),
    ).rejects.toThrow('categoria inexistente');
  });

  it('rodar o seed de novo não desfaz o redirecionamento feito ao arquivar a categoria', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const seed: ProviderCategorySeed[] = [
      { providerCategoryId: 'p1', providerCategoryName: 'Pharmacy', categorySlug: 'saude-farmacia' },
    ];
    await seedProviderCategoryMap(db, seed);
    const [farmacia] = await db.select().from(categories).where(eq(categories.slug, 'saude-farmacia'));
    const [consultas] = await db.select().from(categories).where(eq(categories.slug, 'saude-consultas'));

    await archiveCategory(db, { categoryId: farmacia!.id, moveTransactionsTo: consultas!.id });
    await seedProviderCategoryMap(db, seed);
    const [row] = await db.select().from(providerCategoryMap);
    expect(row!.categoryId).toBe(consultas!.id);

    // Entrada sem categoria (ou com categoria arquivada) volta a ser preenchida pelo seed
    await db.update(providerCategoryMap).set({ categoryId: null });
    await seedProviderCategoryMap(db, [{ ...seed[0]!, categorySlug: 'saude-consultas' }]);
    const [refilled] = await db.select().from(providerCategoryMap);
    expect(refilled!.categoryId).toBe(consultas!.id);
  });
});
