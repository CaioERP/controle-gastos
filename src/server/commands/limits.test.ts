import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  categories,
  institutions,
  notificationPreferences,
  notifications,
  spendingLimitDispatches,
  spendingLimits,
  transactions,
} from '../db/schema';
import { seedBase } from '../db/seed';
import { CommandError } from '../domain/errors';
import {
  deleteSpendingLimit,
  evaluateSpendingLimits,
  upsertSpendingLimit,
} from './limits';
import {
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from './notifications';

describe('limits and notifications commands (A4-02)', () => {
  it('cria, atualiza e exclui spending limits com validações', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [cat] = await db
      .select()
      .from(categories)
      .where(eq(categories.kind, 'expense'))
      .limit(1);

    // 1. Cria limite
    const { limitId } = await upsertSpendingLimit(db, {
      name: 'Alimentação Mensal',
      categoryId: cat!.id,
      amountCents: 150000,
      thresholds: [80, 100],
      notifyPace: true,
      period: 'monthly',
    });

    const [created] = await db
      .select()
      .from(spendingLimits)
      .where(eq(spendingLimits.id, limitId));
    expect(created).toBeDefined();
    expect(created!.name).toBe('Alimentação Mensal');
    expect(created!.amountCents).toBe(150000);
    expect(created!.thresholds).toEqual([80, 100]);

    // 2. Atualiza limite existente
    await upsertSpendingLimit(db, {
      id: limitId,
      name: 'Alimentação Atualizada',
      amountCents: 180000,
      categoryId: cat!.id,
    });

    const [updated] = await db
      .select()
      .from(spendingLimits)
      .where(eq(spendingLimits.id, limitId));
    expect(updated!.name).toBe('Alimentação Atualizada');
    expect(updated!.amountCents).toBe(180000);

    // 3. Validação de valor <= 0
    await expect(
      upsertSpendingLimit(db, {
        name: 'Invalido',
        amountCents: 0,
      }),
    ).rejects.toThrow(CommandError);

    // 4. Cria despacho simulado e exclui o limite (cascade)
    await db.insert(spendingLimitDispatches).values({
      limitId,
      periodKey: '2026-10',
      threshold: 80,
    });

    await deleteSpendingLimit(db, { limitId });

    const [deletedLimit] = await db
      .select()
      .from(spendingLimits)
      .where(eq(spendingLimits.id, limitId));
    expect(deletedLimit).toBeUndefined();

    const dispatches = await db
      .select()
      .from(spendingLimitDispatches)
      .where(eq(spendingLimitDispatches.limitId, limitId));
    expect(dispatches).toHaveLength(0);
  });

  it('gerencia notificações e preferências de alertas', async () => {
    const db = await createTestDb();
    await seedBase(db);

    // 1. Cria notificações não lidas
    const [notif1] = await db
      .insert(notifications)
      .values({
        type: 'threshold_80',
        title: 'Alerta 1',
        message: 'Mensagem 1',
        channel: 'in_app',
      })
      .returning();

    const [notif2] = await db
      .insert(notifications)
      .values({
        type: 'threshold_100',
        title: 'Alerta 2',
        message: 'Mensagem 2',
        channel: 'in_app',
      })
      .returning();

    // 2. Marca notif1 como lida
    await markNotificationRead(db, { notificationId: notif1!.id });

    const [readNotif1] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notif1!.id));
    expect(readNotif1!.readAt).not.toBeNull();

    const [unreadNotif2] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notif2!.id));
    expect(unreadNotif2!.readAt).toBeNull();

    // 3. Marca todas como lidas
    const res = await markAllNotificationsRead(db);
    expect(res.updated).toBe(1); // apenas notif2 estava pendente

    const [readNotif2] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notif2!.id));
    expect(readNotif2!.readAt).not.toBeNull();

    // 4. Atualiza preferências de notificação (desativa threshold_80)
    await updateNotificationPreferences(db, {
      preferences: [
        {
          type: 'threshold_80',
          enabled: false,
          inApp: false,
        },
      ],
    });

    const [pref] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.type, 'threshold_80'));
    expect(pref).toBeDefined();
    expect(pref!.enabled).toBe(false);
  });

  it('evaluateSpendingLimits executa avaliação integrada de limites e alertas', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Conta Corrente',
        type: 'checking',
        balanceCents: 100000,
      })
      .returning();

    const [cat] = await db
      .select()
      .from(categories)
      .where(eq(categories.kind, 'expense'))
      .limit(1);

    await upsertSpendingLimit(db, {
      name: 'Alimentação Rápida',
      categoryId: cat!.id,
      amountCents: 20000,
      thresholds: [80, 100],
      period: 'monthly',
      notifyPace: false,
    });

    // Despesa de R$ 180 (90%)
    const [tx] = await db
      .insert(transactions)
      .values({
        accountId: acc!.id,
        date: '2026-10-10',
        amountCents: -18000,
        currency: 'BRL',
        descriptionRaw: 'Lanche',
        description: 'Lanche',
        kind: 'expense',
        paymentMethod: 'pix',
        status: 'posted',
        categoryId: cat!.id,
      })
      .returning();

    const result = await evaluateSpendingLimits(db, {
      today: '2026-10-10',
      transactionIds: [tx!.id],
    });

    expect(result.evaluatedLimits).toBe(1);
    expect(result.newNotifications).toBe(1);

    const notifs = await db.select().from(notifications);
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.type).toBe('threshold_80');
  });
});
