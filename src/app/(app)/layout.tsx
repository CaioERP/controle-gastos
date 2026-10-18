import * as React from 'react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { LogoutButton } from '@/components/layout/logout-button';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <AppSidebar footerSlot={<LogoutButton />} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav footerSlot={<LogoutButton />} />
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
