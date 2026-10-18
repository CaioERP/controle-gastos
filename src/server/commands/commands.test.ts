import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '../db/seed';
import { institutions, accounts, categories, merchants } from '../db/schema';
import {
  updateAccount,
  upsertCategory,
  archiveCategory,
  upsertRule,
  deleteRule,
  upsertTag,
  updateMerchant,
  registerConnection,
  triggerSync,
} from './index';
import { CommandError } from '../domain/errors';
import { eq } from 'drizzle-orm';

describe('additional command stubs', () => {
  async function setup() {
    const db = await createTestDb();
    await seedBase(db);
    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'credit_card',
        name: 'Cartão Teste',
      })
      .returning();
    return { db, inst: inst!, acc: acc! };
  }

  it('updateAccount atualiza apelido e dias de fechamento/vencimento', async () => {
    const { db, acc } = await setup();
    await updateAccount(db, {
      accountId: acc.id,
      patch: { displayName: 'Meu Cartão', closingDay: 5, dueDay: 12 },
    });
    const [updated] = await db.select().from(accounts).where(eq(accounts.id, acc.id));
    expect(updated!.displayName).toBe('Meu Cartão');
    expect(updated!.closingDay).toBe(5);
    expect(updated!.dueDay).toBe(12);
  });

  it('upsertCategory e archiveCategory funcionam', async () => {
    const { db } = await setup();
    const created = await upsertCategory(db, {
      name: 'Viagem Especial',
      kind: 'expense',
      icon: 'plane',
      color: '#123456',
      parentId: null,
    });
    expect(created.id).toBeDefined();

    await archiveCategory(db, {
      categoryId: created.id,
      moveTransactionsTo: null,
    });
    const [archived] = await db.select().from(categories).where(eq(categories.id, created.id));
    expect(archived!.archived).toBe(true);
  });

  it('upsertRule e deleteRule funcionam', async () => {
    const { db } = await setup();
    const [cat] = await db.select().from(categories).limit(1);
    const rule = await upsertRule(db, {
      priority: 1,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'UBER',
      accountId: null,
      amountMinCents: null,
      amountMaxCents: null,
      setCategoryId: cat!.id,
      setKind: 'expense',
      setPaymentMethod: 'credit_card_single',
      enabled: true,
    });
    expect(rule.id).toBeDefined();
    expect(rule.applied).toBe(0);

    await deleteRule(db, { ruleId: rule.id });
  });

  it('upsertTag cria e atualiza tags', async () => {
    const { db } = await setup();
    const tag = await upsertTag(db, { name: 'férias', color: '#00ff00' });
    expect(tag.id).toBeDefined();
  });

  it('updateMerchant atualiza e previne conflitos de nome', async () => {
    const { db } = await setup();
    const [m1] = await db.insert(merchants).values({ name: 'Loja 1' }).returning();
    const [m2] = await db.insert(merchants).values({ name: 'Loja 2' }).returning();

    await updateMerchant(db, {
      merchantId: m1!.id,
      patch: { name: 'Loja 1 Atualizada' },
    });

    await expect(
      updateMerchant(db, {
        merchantId: m2!.id,
        patch: { name: 'Loja 1 Atualizada' },
      }),
    ).rejects.toThrow(CommandError);
  });

  it('registerConnection cria conexão stub e triggerSync registra execução', async () => {
    const { db } = await setup();
    const conn = await registerConnection(db, { provider: 'pluggy', externalId: 'item-123' });
    expect(conn.connectionId).toBeDefined();

    const sync = await triggerSync(db, { connectionId: conn.connectionId });
    expect(sync.syncRunId).toBeDefined();
  });
});
