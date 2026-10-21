'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { NAV_GROUPS, isNavItemActive } from './nav-items';
import { cn } from '@/lib/utils';
import { ReviewCountBadge } from '@/components/review/review-count-badge';

const STORAGE_KEY = 'nav-groups-open';

type OpenState = Record<string, boolean>;

const DEFAULT_OPEN: OpenState = Object.fromEntries(NAV_GROUPS.map((g) => [g.id, g.defaultOpen]));

// Preferência de grupos abertos: fica no localStorage, com cópia em memória para quando o
// armazenamento estiver bloqueado (aba anônima). O servidor sempre usa o padrão.
let memory: string | null | undefined;
const listeners = new Set<() => void>();

function readStored(): string | null {
  if (memory === undefined) {
    try {
      memory = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      memory = null;
    }
  }
  return memory;
}

function writeStored(state: OpenState) {
  memory = JSON.stringify(state);
  try {
    window.localStorage.setItem(STORAGE_KEY, memory);
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

function parseOpen(raw: string | null): OpenState {
  if (!raw) return DEFAULT_OPEN;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? { ...DEFAULT_OPEN, ...(parsed as OpenState) }
      : DEFAULT_OPEN;
  } catch {
    return DEFAULT_OPEN;
  }
}

export interface NavListProps {
  reviewCount?: number;
  onNavigate?: () => void;
}

export function NavList({ reviewCount = 0, onNavigate }: NavListProps) {
  const pathname = usePathname();
  const raw = React.useSyncExternalStore(subscribe, readStored, () => null);
  const open = React.useMemo(() => parseOpen(raw), [raw]);

  const toggle = (id: string) => {
    writeStored({ ...open, [id]: !open[id] });
  };

  return (
    <div className="space-y-4">
      {NAV_GROUPS.map((group) => {
        const hasActive = group.items.some((item) => isNavItemActive(item.href, pathname));
        // O grupo da tela atual nunca fica escondido.
        const isOpen = group.label === null || hasActive || open[group.id];
        const listId = `nav-group-${group.id}`;

        return (
          <div key={group.id}>
            {group.label !== null && (
              <button
                type="button"
                onClick={() => toggle(group.id)}
                disabled={hasActive}
                aria-expanded={isOpen}
                aria-controls={listId}
                className="flex w-full items-center gap-1.5 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground/80"
              >
                <ChevronRight
                  className={cn('h-3 w-3 shrink-0 transition-transform', isOpen && 'rotate-90')}
                  aria-hidden
                />
                <span className="flex-1 text-left">{group.label}</span>
              </button>
            )}
            {isOpen && (
              <ul id={listId} className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = isNavItemActive(item.href, pathname);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.href === '/revisao' && <ReviewCountBadge count={reviewCount} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
