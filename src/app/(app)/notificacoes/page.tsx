import { getDb } from '@/server/db/client';
import {
  getNotificationPreferences,
  listNotifications,
} from '@/server/queries/notifications';
import { NotificationsView } from '@/components/notifications/notifications-view';

export const dynamic = 'force-dynamic';

export default async function NotificacoesPage() {
  const db = getDb();

  const [{ items, unreadCount }, preferences] = await Promise.all([
    listNotifications(db, { limit: 100 }),
    getNotificationPreferences(db),
  ]);

  return (
    <NotificationsView
      initialNotifications={items}
      initialUnreadCount={unreadCount}
      initialPreferences={preferences}
    />
  );
}
