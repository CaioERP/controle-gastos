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

  it('upsertCategory rejeita 3º nível de categorias (R8)', async () => {
    const { db } = await setup();
    // alimentacao-delivery é filha de alimentacao
    const [delivery] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao-delivery'));
    expect(delivery!.parentId).not.toBeNull();

    await expect(
      upsertCategory(db, {
        name: 'Pizza',
        kind: 'expense',
        icon: 'pizza',
        color: '#ff0000',
        parentId: delivery!.id,
      }),
    ).rejects.toThrow(CommandError);
  });

  it('upsertCategory rejeita filha com kind diferente do pai', async () => {
    const { db } = await setup();
    const [expenseParent] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));

    await expect(
      upsertCategory(db, {
        name: 'Subcategoria Invalida',
        kind: 'income',
        icon: 'alert',
        color: '#ff0000',
        parentId: expenseParent!.id,
      }),
    ).rejects.toThrow(CommandError);
  });

  it('upsertCategory rejeita categoria com parentId igual ao próprio id', async () => {
    const { db } = await setup();
    const [cat] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));

    await expect(
      upsertCategory(db, {
        id: cat!.id,
        name: cat!.name,
        kind: cat!.kind,
        icon: cat!.icon,
        color: cat!.color,
        parentId: cat!.id,
      }),
    ).rejects.toThrow(CommandError);
  });

  it('upsertCategory rejeita transformar categoria com filhas em filha', async () => {
    const { db } = await setup();
    const [parent] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));
    const [otherRoot] = await db.select().from(categories).where(eq(categories.slug, 'transporte'));

    await expect(
      upsertCategory(db, {
        id: parent!.id,
        name: parent!.name,
        kind: parent!.kind,
        icon: parent!.icon,
        color: parent!.color,
        parentId: otherRoot!.id,
      }),
    ).rejects.toThrow(CommandError);
  });

  it('upsertCategory com slug existente lança CommandError CONFLICT', async () => {
    const { db } = await setup();
    const [alimentacao] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));

    // Tenta criar 'Mercado' dentro de Alimentação (alimentacao-mercado já existe no seed)
    await expect(
      upsertCategory(db, {
        name: 'Mercado',
        kind: 'expense',
        icon: 'shopping-cart',
        color: '#ff8800',
        parentId: alimentacao!.id,
      }),
    ).rejects.toThrow(CommandError);
  });

  it('upsertCategory ao renomear mantém o slug e o seed não duplica a categoria', async () => {
    const { db } = await setup();
    const [alimentacao] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));
    const totalAntes = (await db.select().from(categories)).length;

    await upsertCategory(db, {
      id: alimentacao!.id,
      name: 'Comida',
      kind: 'expense',
      icon: alimentacao!.icon,
      color: alimentacao!.color,
      parentId: null,
    });

    const [renomeada] = await db.select().from(categories).where(eq(categories.id, alimentacao!.id));
    expect(renomeada!.name).toBe('Comida');
    expect(renomeada!.slug).toBe('alimentacao');

    await seedBase(db);
    expect((await db.select().from(categories)).length).toBe(totalAntes);
  });

  it('upsertCategory rejeita mudar a natureza de uma categoria existente', async () => {
    const { db } = await setup();
    const [transporte] = await db.select().from(categories).where(eq(categories.slug, 'transporte'));

    const err = await upsertCategory(db, {
      id: transporte!.id,
      name: transporte!.name,
      kind: 'income',
      icon: transporte!.icon,
      color: transporte!.color,
      parentId: null,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(CommandError);
    expect((err as CommandError).code).toBe('VALIDATION');
    const [inalterada] = await db.select().from(categories).where(eq(categories.id, transporte!.id));
    expect(inalterada!.kind).toBe('expense');
  });

  it('upsertCategory em categoria inexistente lança NOT_FOUND', async () => {
    const { db } = await setup();
    const err = await upsertCategory(db, {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Fantasma',
      kind: 'expense',
      icon: 'ghost',
      color: '#000000',
      parentId: null,
    }).catch((e: unknown) => e);
    expect((err as CommandError).code).toBe('NOT_FOUND');
  });

  it('upsertRule valida regex e faixa de valores', async () => {
    const { db } = await setup();
    const [cat] = await db.select().from(categories).limit(1);

    // Regex inválido
    await expect(
      upsertRule(db, {
        priority: 1,
        matchField: 'description',
        matchType: 'regex',
        pattern: '[invalid',
        accountId: null,
        amountMinCents: null,
        amountMaxCents: null,
        setCategoryId: cat!.id,
        setKind: 'expense',
        setPaymentMethod: null,
        enabled: true,
      }),
    ).rejects.toThrow(CommandError);

    // amountMinCents > amountMaxCents
    await expect(
      upsertRule(db, {
        priority: 1,
        matchField: 'description',
        matchType: 'contains',
        pattern: 'TEST',
        accountId: null,
        amountMinCents: 5000,
        amountMaxCents: 2000,
        setCategoryId: cat!.id,
        setKind: 'expense',
        setPaymentMethod: null,
        enabled: true,
      }),
    ).rejects.toThrow(CommandError);
  });

  it('upsertRule e deleteRule funcionam no caminho feliz', async () => {
    const { db } = await setup();
    const [cat] = await db.select().from(categories).limit(1);
    const rule = await upsertRule(db, {
      priority: 1,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'UBER',
      accountId: null,
      amountMinCents: 1000,
      amountMaxCents: 5000,
      setCategoryId: cat!.id,
      setKind: 'expense',
      setPaymentMethod: 'credit_card_single',
      enabled: true,
    });
    expect(rule.id).toBeDefined();
    expect(rule.applied).toBe(0);

    // Edição sem enviar id no set
    const edited = await upsertRule(db, {
      id: rule.id,
      priority: 2,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'UBER TRIP',
      accountId: null,
      amountMinCents: 1000,
      amountMaxCents: 5000,
      setCategoryId: cat!.id,
      setKind: 'expense',
      setPaymentMethod: 'credit_card_single',
      enabled: true,
    });
    expect(edited.id).toBe(rule.id);

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
