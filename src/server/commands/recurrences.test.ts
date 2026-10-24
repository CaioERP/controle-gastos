import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  categories,
  institutions,
  recurrences,
  transactions,
} from '../db/schema';
import { seedBase } from '../db/seed';
import { CommandError } from '../domain/errors';
import { runJob } from '../jobs/registry';
import {
  deleteRecurrence,
  detectRecurrences,
  setRecurrenceStatus,
  upsertRecurrence,
} from './recurrences';

describe('recurrences commands (A4-01)', () => {
  it('cria, atualiza e exclui recorrência manual com validações', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [cat] = await db
      .select()
      .from(categories)
      .where(eq(categories.kind, 'expense'))
      .limit(1);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        name: 'Conta Teste',
        type: 'checking',
        institutionId: inst!.id,
        currency: 'BRL',
        balanceCents: 100000,
      })
      .returning();

    // 1. Criação com sucesso
    const { recurrenceId } = await upsertRecurrence(db, {
      description: 'Aluguel do Apartamento',
      amountCents: 250000,
      frequency: 'monthly',
      expectedDay: 5,
      categoryId: cat!.id,
      accountId: acc!.id,
      isSubscription: false,
    });

    const [created] = await db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId));
    expect(created).toBeDefined();
    expect(created?.description).toBe('Aluguel do Apartamento');
    expect(created?.amountCents).toBe(250000);
    expect(created?.expectedDay).toBe(5);
    expect(created?.autoDetected).toBe(false);

    // 2. Atualização
    await upsertRecurrence(db, {
      id: recurrenceId,
      description: 'Aluguel com Condomínio',
      amountCents: 280000,
      frequency: 'monthly',
      expectedDay: 10,
    });

    const [updated] = await db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId));
    expect(updated?.description).toBe('Aluguel com Condomínio');
    expect(updated?.amountCents).toBe(280000);
    expect(updated?.expectedDay).toBe(10);

    // 3. Validação: valor inválido
    await expect(
      upsertRecurrence(db, {
        description: 'Inválido',
        amountCents: -100,
      }),
    ).rejects.toThrow(CommandError);

    // 4. Validação: categoria inexistente
    await expect(
      upsertRecurrence(db, {
        description: 'Sem Cat',
        amountCents: 1000,
        categoryId: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(CommandError);

    // 5. Exclusão
    await deleteRecurrence(db, { recurrenceId });
    const [deleted] = await db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId));
    expect(deleted).toBeUndefined();

    // 6. Exclusão de id inexistente
    await expect(
      deleteRecurrence(db, { recurrenceId }),
    ).rejects.toThrow(CommandError);
  });

  it('detectRecurrences executa e integra com runJob detect-recurrences', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        name: 'Cartão de Crédito',
        type: 'credit_card',
        institutionId: inst!.id,
        currency: 'BRL',
        balanceCents: 0,
      })
      .returning();

    // 3 transações de assinatura mensal
    await db.insert(transactions).values([
      {
        accountId: acc!.id,
        date: '2026-07-15',
        amountCents: -1990,
        currency: 'BRL',
        descriptionRaw: 'AMAZON PRIME',
        description: 'Amazon Prime',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        status: 'posted',
      },
      {
        accountId: acc!.id,
        date: '2026-08-15',
        amountCents: -1990,
        currency: 'BRL',
        descriptionRaw: 'AMAZON PRIME',
        description: 'Amazon Prime',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        status: 'posted',
      },
      {
        accountId: acc!.id,
        date: '2026-09-15',
        amountCents: -1990,
        currency: 'BRL',
        descriptionRaw: 'AMAZON PRIME',
        description: 'Amazon Prime',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        status: 'posted',
      },
    ]);

    // Executa via runJob do registry
    const runResult = await runJob(db, 'detect-recurrences');
    expect(runResult.result).toEqual(
      expect.objectContaining({
        detected: 1,
      }),
    );

    // Executa diretamente para validar a chamada direta do comando
    const directRes = await detectRecurrences(db);
    expect(directRes.detected).toBe(0);

    const recs = await db.select().from(recurrences);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.description).toContain('Amazon Prime');
    expect(recs[0]?.isSubscription).toBe(true);
  });

  it('setRecurrenceStatus alterna status sem alterar outros campos e devolve NOT_FOUND se inexistente', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [cat] = await db
      .select()
      .from(categories)
      .where(eq(categories.kind, 'expense'))
      .limit(1);

    const { recurrenceId } = await upsertRecurrence(db, {
      description: 'Academia Mensal',
      amountCents: 12900,
      frequency: 'monthly',
      expectedDay: 10,
      categoryId: cat!.id,
      isSubscription: true,
      status: 'active',
    });

    // Pausa a recorrência
    await setRecurrenceStatus(db, { id: recurrenceId, status: 'paused' });

    const [paused] = await db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId));
    expect(paused).toBeDefined();
    expect(paused!.status).toBe('paused');
    expect(paused!.description).toBe('Academia Mensal');
    expect(paused!.amountCents).toBe(12900);
    expect(paused!.expectedDay).toBe(10);
    expect(paused!.categoryId).toBe(cat!.id);
    expect(paused!.isSubscription).toBe(true);

    // Cancela a recorrência
    await setRecurrenceStatus(db, { id: recurrenceId, status: 'cancelled' });

    const [cancelled] = await db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId));
    expect(cancelled!.status).toBe('cancelled');

    // Reativa a recorrência
    await setRecurrenceStatus(db, { id: recurrenceId, status: 'active' });

    const [reactivated] = await db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId));
    expect(reactivated!.status).toBe('active');

    // ID inexistente lança NOT_FOUND
    await expect(
      setRecurrenceStatus(db, {
        id: '00000000-0000-0000-0000-000000000000',
        status: 'paused',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Recorrência não encontrada',
    });

    // ID inválido lança erro de validação (ZodError)
    await expect(
      setRecurrenceStatus(db, {
        id: 'invalido',
        status: 'paused',
      }),
    ).rejects.toThrow();
  });
});
