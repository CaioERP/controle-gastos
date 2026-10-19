import * as React from 'react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { LogoutButton } from '@/components/layout/logout-button';
import { getDb } from '@/server/db/client';
import { getReviewCount } from '@/server/queries/transactions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Badge do item "Revisão"; atualizado pelo revalidatePath('/', 'layout') das Server Actions.
  const reviewCount = await getReviewCount(getDb());
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <AppSidebar footerSlot={<LogoutButton />} reviewCount={reviewCount} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav footerSlot={<LogoutButton />} reviewCount={reviewCount} />
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
