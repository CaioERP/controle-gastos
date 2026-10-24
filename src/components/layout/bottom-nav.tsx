'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Landmark, LayoutDashboard, ListOrdered, PieChart, Menu } from 'lucide-react';
import { isNavItemActive } from './nav-items';
import { NavList } from './nav-list';
import { SearchTrigger } from './command-palette';
import { PrivacyToggle } from './privacy-toggle';
import { ThemeToggle } from './theme-toggle';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface BottomNavProps {
  reviewCount?: number;
  footerSlot?: React.ReactNode;
}

const PRIMARY_NAV = [
  { href: '/', label: 'Início', icon: LayoutDashboard, featured: false },
  { href: '/transacoes', label: 'Transações', icon: ListOrdered, featured: false },
  { href: '/contas', label: 'Contas', icon: Landmark, featured: true },
  { href: '/analise', label: 'Análise', icon: PieChart, featured: false },
] as const;

/**
 * Barra de navegação inferior exclusiva para dispositivos móveis (< md / 768px).
 * Início, Transações, Contas (no centro, em destaque), Análise e o menu "Mais".
 */
export function BottomNav({ reviewCount = 0, footerSlot }: BottomNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <nav
      aria-label="Navegação inferior"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border h-[calc(4rem+env(safe-area-inset-bottom))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] grid grid-cols-5 items-end"
    >
      {PRIMARY_NAV.map((item) => {
        const active = isNavItemActive(item.href, pathname);

        if (item.featured) {
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-end gap-1 text-[11px] transition-colors',
                active
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="-mt-6 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md border-[3px] border-background">
                <item.icon className="size-5" />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center justify-end gap-1 text-[11px] transition-colors',
              active
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <item.icon className="size-5" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              type="button"
              aria-label="Abrir menu de navegação"
              className={cn(
                'flex flex-col items-center justify-end gap-1 text-[11px] transition-colors w-full',
                open
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="relative flex items-center justify-center">
                <Menu className="size-5" />
                {reviewCount > 0 && (
                  <span
                    aria-label={`${reviewCount} ${reviewCount === 1 ? 'transação para revisar' : 'transações para revisar'}`}
                    className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground leading-none"
                  >
                    {reviewCount > 99 ? '99+' : reviewCount}
                  </span>
                )}
              </span>
              <span>Mais</span>
            </button>
          }
        />
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetHeader className="p-4 border-b border-border text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className="font-semibold">Controle de Gastos</span>
            </SheetTitle>
          </SheetHeader>
          <div className="p-3 pb-0">
            <SearchTrigger />
          </div>
          <nav className="flex-1 overflow-y-auto p-3">
            <NavList reviewCount={reviewCount} onNavigate={() => setOpen(false)} />
          </nav>
          <div className="p-4 border-t border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden">{footerSlot}</div>
            <div className="flex items-center gap-2">
              <PrivacyToggle />
              <ThemeToggle />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
