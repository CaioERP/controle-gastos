import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { notificationPreferences, notifications } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { getNotificationPreferences, listNotifications } from './notifications';

describe('notifications queries', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
  });

  it('lista notificações com contagem de não lidas e cálculo de tempo relativo', async () => {
    // Insere uma lida e uma não lida
    const [unread] = await db
      .insert(notifications)
      .values({
        type: 'threshold_80',
        title: '80% da Meta de Alimentação',
        message: 'Você gastou R$ 800 de R$ 1.000.',
        actionUrl: '/transacoes?cat=123',
        createdAt: new Date(),
      })
      .returning();

    await db
      .insert(notifications)
      .values({
        type: 'invoice_due_soon',
        title: 'Fatura Nubank vencendo',
        message: 'Sua fatura de R$ 1.500 vence em 3 dias.',
        readAt: new Date(),
        createdAt: new Date(Date.now() - 3600_000), // há 1h
      })
      .returning();

    const result = await listNotifications(db);
    expect(result.unreadCount).toBeGreaterThanOrEqual(1);
    expect(result.items.length).toBeGreaterThanOrEqual(2);

    const foundUnread = result.items.find((n) => n.id === unread!.id);
    expect(foundUnread).toBeDefined();
    expect(foundUnread?.isRead).toBe(false);
    expect(foundUnread?.readAt).toBeNull();
    expect(foundUnread?.timeAgo).toBeDefined();
    expect(foundUnread?.actionUrl).toBe('/transacoes?cat=123');

    // Filtro unreadOnly
    const unreadOnly = await listNotifications(db, { unreadOnly: true });
    expect(unreadOnly.items.every((n) => !n.isRead)).toBe(true);
  });

  it('retorna todas as categorias de preferências de alerta com defaults', async () => {
    // Insere preferência customizada para threshold_100
    await db
      .insert(notificationPreferences)
      .values({
        type: 'threshold_100',
        enabled: false,
        inApp: false,
        telegram: true,
      })
      .onConflictDoNothing();

    const prefs = await getNotificationPreferences(db);
    expect(prefs.length).toBe(9);

    const t100 = prefs.find((p) => p.type === 'threshold_100');
    expect(t100).toBeDefined();
    expect(t100?.enabled).toBe(false);
    expect(t100?.telegram).toBe(true);

    const t80 = prefs.find((p) => p.type === 'threshold_80');
    expect(t80).toBeDefined();
    expect(t80?.enabled).toBe(true);
  });
});
