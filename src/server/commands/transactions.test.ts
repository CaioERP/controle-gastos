import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { institutions, accounts, transactions, tags, transactionTags } from '../db/schema';
import { markReviewed, recategorize, updateTransaction } from './transactions';
import { CommandError } from '../domain/errors';
import { seedBase } from '../db/seed';
import { eq } from 'drizzle-orm';

describe('transaction commands', () => {
  async function setupFixture() {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'checking',
        name: 'Conta Teste',
      })
      .returning();

    const [tx] = await db
      .insert(transactions)
      .values({
        accountId: acc!.id,
        date: '2026-10-10',
        amountCents: -5000,
        descriptionRaw: 'TEST SHOP',
        description: 'Test Shop',
        kind: 'expense',
        paymentMethod: 'debit_card',
        needsReview: true,
      })
      .returning();

    return { db, acc: acc!, tx: tx! };
  }

  it('recategorize define categoria, source=user e user_edited_fields sem duplicar', async () => {
    const { db, tx } = await setupFixture();

    const { categories } = await import('../db/schema');
    const [catRow] = await db.select().from(categories).limit(1);

    // Primeira recategorização
    const res1 = await recategorize(db, {
      transactionId: tx.id,
      categoryId: catRow!.id,
      scope: 'this',
    });
    expect(res1.updated).toBe(1);

    // Segunda recategorização
    const res2 = await recategorize(db, {
      transactionId: tx.id,
      categoryId: catRow!.id,
      scope: 'similar',
    });
    expect(res2.updated).toBe(1);

    const [updatedTx] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
    expect(updatedTx!.categoryId).toBe(catRow!.id);
    expect(updatedTx!.categorySource).toBe('user');
    expect(updatedTx!.categoryConfidence).toBe(1);
    expect(updatedTx!.needsReview).toBe(false);
    expect(updatedTx!.userEditedFields).toEqual(['category']);
  });

  it('recategorize com id inexistente lança CommandError NOT_FOUND', async () => {
    const { db } = await setupFixture();
    const { categories } = await import('../db/schema');
    const [catRow] = await db.select().from(categories).limit(1);

    await expect(
      recategorize(db, {
        transactionId: '00000000-0000-0000-0000-000000000000',
        categoryId: catRow!.id,
        scope: 'this',
      }),
    ).rejects.toThrow(CommandError);
  });

  it('updateTransaction com tagIds substitui as tags', async () => {
    const { db, tx } = await setupFixture();

    const [tag1] = await db.insert(tags).values({ name: 'tag1', color: '#111111' }).returning();
    const [tag2] = await db.insert(tags).values({ name: 'tag2', color: '#222222' }).returning();
    const [tag3] = await db.insert(tags).values({ name: 'tag3', color: '#333333' }).returning();

    await updateTransaction(db, {
      transactionId: tx.id,
      patch: {
        description: 'Nova Descricao',
        tagIds: [tag1!.id, tag2!.id],
      },
    });

    let currentTags = await db.select().from(transactionTags).where(eq(transactionTags.transactionId, tx.id));
    expect(currentTags.length).toBe(2);

    await updateTransaction(db, {
      transactionId: tx.id,
      patch: {
        tagIds: [tag3!.id],
      },
    });

    currentTags = await db.select().from(transactionTags).where(eq(transactionTags.transactionId, tx.id));
    expect(currentTags.length).toBe(1);
    expect(currentTags[0]!.tagId).toBe(tag3!.id);
  });

  it('markReviewed marca needs_review como false', async () => {
    const { db, tx } = await setupFixture();

    const res = await markReviewed(db, { transactionIds: [tx.id] });
    expect(res.updated).toBe(1);

    const [updatedTx] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
    expect(updatedTx!.needsReview).toBe(false);
  });
});
