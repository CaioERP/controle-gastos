import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { accounts, categories, institutions, transactions } from '../db/schema';
import { seedBase } from '../db/seed';
import { CommandError } from '../domain/errors';
import { defaultFilters } from '../domain/filters';
import { listTransactions } from '../queries/transactions';
import { splitTransaction, unsplitTransaction } from './split';

describe('split commands', () => {
  async function setup() {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);

    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        connectionId: null,
        type: 'checking',
        name: 'Conta Corrente',
        balanceCents: 50000,
      })
      .returning();

    const expenseCats = await db
      .select()
      .from(categories)
      .where(eq(categories.kind, 'expense'))
      .limit(2);

    const [mother] = await db
      .insert(transactions)
      .values({
        accountId: acc!.id,
        date: '2026-10-15',
        amountCents: -10000,
        currency: 'BRL',
        descriptionRaw: 'Supermercado Central',
        description: 'Supermercado Central',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
        categoryId: expenseCats[0]!.id,
      })
      .returning();

    return {
      db,
      acc: acc!,
      mother: mother!,
      cat1: expenseCats[0]!,
      cat2: expenseCats[1]!,
    };
  }

  it('divisão em 2 partes com categorias diferentes: filhas criadas com sucesso, mãe excluída da listagem e totais', async () => {
    const { db, mother, cat1, cat2 } = await setup();

    const { splitIds } = await splitTransaction(db, {
      transactionId: mother.id,
      parts: [
        {
          amountCents: -6000,
          categoryId: cat1.id,
          description: 'Supermercado - Alimentação',
        },
        {
          amountCents: -4000,
          categoryId: cat2.id,
          description: 'Supermercado - Farmácia / Higiene',
        },
      ],
    });

    expect(splitIds).toHaveLength(2);

    // Confere registros no banco
    const [child1] = await db.select().from(transactions).where(eq(transactions.id, splitIds[0]!));
    const [child2] = await db.select().from(transactions).where(eq(transactions.id, splitIds[1]!));

    expect(child1).toBeDefined();
    expect(child1!.parentTransactionId).toBe(mother.id);
    expect(child1!.amountCents).toBe(-6000);
    expect(child1!.categoryId).toBe(cat1.id);
    expect(child1!.description).toBe('Supermercado - Alimentação');
    expect(child1!.categorySource).toBe('user');
    expect(child1!.userEditedFields).toEqual(['category']);

    expect(child2).toBeDefined();
    expect(child2!.parentTransactionId).toBe(mother.id);
    expect(child2!.amountCents).toBe(-4000);
    expect(child2!.categoryId).toBe(cat2.id);
    expect(child2!.description).toBe('Supermercado - Farmácia / Higiene');

    // Confere queries: listTransactions deve retornar as duas filhas e NÃO a mãe
    const listResult = await listTransactions(db, {
      ...defaultFilters(),
      from: '2026-10-01',
      to: '2026-10-31',
    });

    const returnedIds = listResult.items.map((t) => t.id);
    expect(returnedIds).toContain(child1!.id);
    expect(returnedIds).toContain(child2!.id);
    expect(returnedIds).not.toContain(mother.id);
  });

  it('soma divergente em 1 centavo: recusada com VALIDATION', async () => {
    const { db, mother, cat1, cat2 } = await setup();

    await expect(
      splitTransaction(db, {
        transactionId: mother.id,
        parts: [
          { amountCents: -6000, categoryId: cat1.id },
          { amountCents: -3999, categoryId: cat2.id },
        ],
      }),
    ).rejects.toThrow(CommandError);

    try {
      await splitTransaction(db, {
        transactionId: mother.id,
        parts: [
          { amountCents: -6000, categoryId: cat1.id },
          { amountCents: -3999, categoryId: cat2.id },
        ],
      });
    } catch (err) {
      const cmdErr = err as CommandError;
      expect(cmdErr.code).toBe('VALIDATION');
      expect(cmdErr.message).toContain('A soma das partes deve ser exatamente igual');
    }
  });

  it('tentar dividir transação filha ou já dividida: recusadas', async () => {
    const { db, mother, cat1, cat2 } = await setup();

    const { splitIds } = await splitTransaction(db, {
      transactionId: mother.id,
      parts: [
        { amountCents: -5000, categoryId: cat1.id },
        { amountCents: -5000, categoryId: cat2.id },
      ],
    });

    // Tentar dividir a mãe de novo
    await expect(
      splitTransaction(db, {
        transactionId: mother.id,
        parts: [
          { amountCents: -5000, categoryId: cat1.id },
          { amountCents: -5000, categoryId: cat2.id },
        ],
      }),
    ).rejects.toThrow('Esta transação já foi dividida');

    // Tentar dividir a filha
    await expect(
      splitTransaction(db, {
        transactionId: splitIds[0]!,
        parts: [
          { amountCents: -2500, categoryId: cat1.id },
          { amountCents: -2500, categoryId: cat2.id },
        ],
      }),
    ).rejects.toThrow('Não é possível dividir uma transação que já é resultado de uma divisão');
  });

  it('unsplitTransaction: filhas sofrem soft delete e mãe volta a constar nos totais', async () => {
    const { db, mother, cat1, cat2 } = await setup();

    const { splitIds } = await splitTransaction(db, {
      transactionId: mother.id,
      parts: [
        { amountCents: -7000, categoryId: cat1.id },
        { amountCents: -3000, categoryId: cat2.id },
      ],
    });

    // Desfaz passando o ID de uma das filhas (deve funcionar tanto com o ID da mãe quanto da filha)
    await unsplitTransaction(db, { transactionId: splitIds[0]! });

    // Confere que filhas sofreram soft delete
    const [child1] = await db.select().from(transactions).where(eq(transactions.id, splitIds[0]!));
    const [child2] = await db.select().from(transactions).where(eq(transactions.id, splitIds[1]!));
    expect(child1!.deletedAt).not.toBeNull();
    expect(child2!.deletedAt).not.toBeNull();

    // Mãe volta a constar na listagem
    const listResult = await listTransactions(db, {
      ...defaultFilters(),
      from: '2026-10-01',
      to: '2026-10-31',
    });

    const returnedIds = listResult.items.map((t) => t.id);
    expect(returnedIds).toContain(mother.id);
    expect(returnedIds).not.toContain(child1!.id);
    expect(returnedIds).not.toContain(child2!.id);

    // Tentar desfazer de novo lança erro
    await expect(unsplitTransaction(db, { transactionId: mother.id })).rejects.toThrow(
      'não possui divisões ativas',
    );
  });
});
