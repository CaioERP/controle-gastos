import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { accounts, categories, connections, institutions, transactions, transactionSources } from '../db/schema';
import { seedBase } from '../db/seed';
import { CommandError } from '../domain/errors';
import {
  createManualAccount,
  createManualTransaction,
  deleteManualTransaction,
  updateManualTransaction,
} from './manual';

describe('manual commands', () => {
  async function setup() {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [conn] = await db
      .insert(connections)
      .values({
        provider: 'pluggy',
        institutionId: inst!.id,
        externalId: 'conn-test-1',
      })
      .returning();

    const [pluggyAcc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        connectionId: conn!.id,
        type: 'checking',
        name: 'Conta Pluggy',
      })
      .returning();

    const [expenseCat] = await db
      .select()
      .from(categories)
      .where(eq(categories.kind, 'expense'))
      .limit(1);

    return { db, pluggyAcc: pluggyAcc!, expenseCat: expenseCat! };
  }

  it('criar uma conta manual e uma despesa: saldo cai, fonte manual gravada e categoria tem source user', async () => {
    const { db, expenseCat } = await setup();

    const { accountId } = await createManualAccount(db, {
      name: 'Carteira Pessoal',
      type: 'wallet',
      initialBalanceCents: 10000,
    });

    const [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acc).toBeDefined();
    expect(acc!.connectionId).toBeNull();
    expect(acc!.balanceCents).toBe(10000);

    const { transactionId } = await createManualTransaction(db, {
      accountId,
      date: '2026-10-15',
      amountCents: -3500,
      description: 'Lanche na padaria',
      kind: 'expense',
      paymentMethod: 'cash',
      categoryId: expenseCat.id,
      notes: 'Café e pão de queijo',
    });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    expect(tx).toBeDefined();
    expect(tx!.amountCents).toBe(-3500);
    expect(tx!.categoryId).toBe(expenseCat.id);
    expect(tx!.categorySource).toBe('user');
    expect(tx!.categoryConfidence).toBe(1);
    expect(tx!.needsReview).toBe(false);
    expect(tx!.userEditedFields).toEqual(['category']);

    const [source] = await db
      .select()
      .from(transactionSources)
      .where(eq(transactionSources.transactionId, transactionId));
    expect(source).toBeDefined();
    expect(source!.source).toBe('manual');
    expect(source!.externalId).toBe(transactionId);

    const [updatedAcc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(updatedAcc!.balanceCents).toBe(6500);
  });

  it('sinal errado e conta não manual são recusados', async () => {
    const { db, pluggyAcc, expenseCat } = await setup();

    const { accountId } = await createManualAccount(db, {
      name: 'Conta Manual',
      type: 'checking',
    });

    // Despesa com valor positivo deve falhar
    await expect(
      createManualTransaction(db, {
        accountId,
        date: '2026-10-15',
        amountCents: 5000,
        description: 'Despesa positiva inválida',
        kind: 'expense',
        paymentMethod: 'pix',
        categoryId: expenseCat.id,
      }),
    ).rejects.toThrow(CommandError);

    // Receita com valor negativo deve falhar
    await expect(
      createManualTransaction(db, {
        accountId,
        date: '2026-10-15',
        amountCents: -5000,
        description: 'Receita negativa inválida',
        kind: 'income',
        paymentMethod: 'pix',
        categoryId: null,
      }),
    ).rejects.toThrow(CommandError);

    // Lançamento em conta Pluggy (não manual) deve falhar
    await expect(
      createManualTransaction(db, {
        accountId: pluggyAcc.id,
        date: '2026-10-15',
        amountCents: -1000,
        description: 'Tentativa em conta Pluggy',
        kind: 'expense',
        paymentMethod: 'pix',
        categoryId: expenseCat.id,
      }),
    ).rejects.toThrow(CommandError);
  });

  it('alterar o valor ajusta o saldo pela diferença', async () => {
    const { db, expenseCat } = await setup();

    const { accountId } = await createManualAccount(db, {
      name: 'Carteira Dinheiro',
      type: 'wallet',
      initialBalanceCents: 0,
    });

    const { transactionId } = await createManualTransaction(db, {
      accountId,
      date: '2026-10-15',
      amountCents: -2000,
      description: 'Gasto inicial',
      kind: 'expense',
      paymentMethod: 'cash',
      categoryId: expenseCat.id,
    });

    let [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acc!.balanceCents).toBe(-2000);

    // Altera valor de -2000 para -5000 (diferença de -3000)
    await updateManualTransaction(db, {
      transactionId,
      patch: {
        amountCents: -5000,
      },
    });

    [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acc!.balanceCents).toBe(-5000);

    // Altera apenas a data
    await updateManualTransaction(db, {
      transactionId,
      patch: {
        date: '2026-10-16',
      },
    });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    expect(tx!.date).toBe('2026-10-16');
    expect(tx!.amountCents).toBe(-5000);

    [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acc!.balanceCents).toBe(-5000);
  });

  it('excluir faz soft delete e devolve o saldo', async () => {
    const { db, expenseCat } = await setup();

    const { accountId } = await createManualAccount(db, {
      name: 'Carteira Teste',
      type: 'wallet',
      initialBalanceCents: 10000,
    });

    const { transactionId } = await createManualTransaction(db, {
      accountId,
      date: '2026-10-15',
      amountCents: -4000,
      description: 'Compra a ser cancelada',
      kind: 'expense',
      paymentMethod: 'cash',
      categoryId: expenseCat.id,
    });

    let [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acc!.balanceCents).toBe(6000);

    await deleteManualTransaction(db, { transactionId });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    expect(tx!.deletedAt).not.toBeNull();

    [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acc!.balanceCents).toBe(10000);

    // Excluir de novo deve lançar NOT_FOUND
    await expect(deleteManualTransaction(db, { transactionId })).rejects.toThrow(CommandError);
  });
});