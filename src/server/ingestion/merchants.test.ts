import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import type { Db } from '../db/client';
import { merchants } from '../db/schema';
import { seedBase } from '../db/seed';
import { findOrCreateMerchant } from './merchants';

describe('findOrCreateMerchant (A1-03)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
  });

  it('cria merchant novo quando não existe e registra rawAlias em aliases', async () => {
    const res = await findOrCreateMerchant(db, 'Ifood', 'IFD*IFOOD RESTAURANTE');
    expect(res.id).toBeDefined();
    expect(res.defaultCategoryId).toBeNull();

    const [row] = await db.select().from(merchants).where(eq(merchants.id, res.id));
    expect(row!.name).toBe('Ifood');
    expect(row!.aliases).toEqual(['IFD*IFOOD RESTAURANTE']);
  });

  it('encontra pelo nome normalizado (ignorando acentos/maiúsculas) e adiciona alias sem duplicar', async () => {
    const first = await findOrCreateMerchant(db, 'Pão de Açúcar', 'PAO DE ACUCAR 1234');
    const second = await findOrCreateMerchant(db, 'pao de acucar', 'PAO DE ACUCAR 5678');
    const third = await findOrCreateMerchant(db, 'PAO DE ACUCAR', 'PAO DE ACUCAR 1234');

    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);

    const [row] = await db.select().from(merchants).where(eq(merchants.id, first.id));
    expect(row!.aliases).toEqual(['PAO DE ACUCAR 1234', 'PAO DE ACUCAR 5678']);
  });

  it('encontra merchant quando o nome informado bate com um alias existente', async () => {
    const created = await findOrCreateMerchant(db, 'Uber', 'UBER *TRIP');
    const byAlias = await findOrCreateMerchant(db, 'UBER *TRIP', 'UBER *EATS');

    expect(byAlias.id).toBe(created.id);

    const [row] = await db.select().from(merchants).where(eq(merchants.id, created.id));
    expect(row!.aliases).toEqual(['UBER *TRIP', 'UBER *EATS']);
  });
});
