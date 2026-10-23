'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Landmark, LayoutDashboard, ListOrdered, PieChart, Menu, Wallet } from 'lucide-react';
import { isNavItemActive } from './nav-items';
import { NavList } from './nav-list';
import { SearchTrigger } from './command-palette';
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
 * Início, Transações, Contas (no centro, em destaque), Análise e o menu "Mais", que leva a
 * Revisão e as demais telas (com o badge de transações para revisar).
 */
export function BottomNav({ reviewCount = 0, footerSlot }: BottomNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <nav
      aria-label="Navegação inferior"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around h-14">
        {PRIMARY_NAV.map((item) => {
          const active = isNavItemActive(item.href, pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center min-h-[44px] py-1 px-1 flex-1 text-[11px] gap-0.5 transition-colors',
                active
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.featured ? (
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <item.icon className="size-5" />
                </span>
              ) : (
                <item.icon className="size-5" />
              )}
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
                  'flex flex-col items-center justify-center min-h-[44px] py-1 px-1 flex-1 text-[11px] gap-0.5 transition-colors',
                  open
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="relative">
                  <Menu className="size-5" />
                  {reviewCount > 0 && (
                    <span
                      aria-label={`${reviewCount} ${reviewCount === 1 ? 'transação para revisar' : 'transações para revisar'}`}
                      className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground leading-none"
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
                <Wallet className="h-5 w-5 text-primary" />
                Controle de Gastos
              </SheetTitle>
            </SheetHeader>
            <div className="p-3 pb-0">
              <SearchTrigger />
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              <NavList reviewCount={reviewCount} onNavigate={() => setOpen(false)} />
            </nav>
            {footerSlot && <div className="p-4 border-t border-border">{footerSlot}</div>}
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
