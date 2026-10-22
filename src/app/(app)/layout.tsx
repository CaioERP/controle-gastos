import * as React from 'react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { BottomNav } from '@/components/layout/bottom-nav';
import { LogoutButton } from '@/components/layout/logout-button';
import { CommandPaletteProvider } from '@/components/layout/command-palette';
import { getDb } from '@/server/db/client';
import { getReviewCount } from '@/server/queries/transactions';
import { getNotificationPreferences, listNotifications } from '@/server/queries/notifications';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  // Badge do item "Revisão" e notificações; atualizados pelo revalidatePath('/', 'layout')
  const [reviewCount, { items: recentNotifications, unreadCount }, preferences] = await Promise.all([
    getReviewCount(db),
    listNotifications(db, { limit: 10 }),
    getNotificationPreferences(db),
  ]);

  return (
    <CommandPaletteProvider>
      <div className="min-h-screen flex flex-col md:flex-row bg-background">
        <AppSidebar
          footerSlot={<LogoutButton />}
          reviewCount={reviewCount}
          unreadNotificationsCount={unreadCount}
          recentNotifications={recentNotifications}
          notificationPreferences={preferences}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileNav
            unreadNotificationsCount={unreadCount}
            recentNotifications={recentNotifications}
            notificationPreferences={preferences}
          />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:p-8">
            {children}
          </main>
          <BottomNav reviewCount={reviewCount} footerSlot={<LogoutButton />} />
        </div>
      </div>
    </CommandPaletteProvider>
  );
}