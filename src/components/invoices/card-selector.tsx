'use client';

import * as React from 'react';
import Link, { useLinkStatus } from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CardOption = {
  id: string;
  name: string;
  institutionName: string;
  institutionColor: string;
};

type CardSelectorProps = {
  cards: CardOption[];
  selectedId: string;
};

function CardTabInner({
  color,
  name,
}: {
  color: string;
  name: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? (
        <Loader2 className="size-2.5 animate-spin" />
      ) : (
        <span
          aria-hidden
          className="size-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{name}</span>
    </>
  );
}

/** Abas de cartões no desktop; select nativo no celular. Trocar de cartão limpa `fatura=` (volta à aberta). */
export function CardSelector({ cards, selectedId }: CardSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const href = (id: string) => `/faturas?cartao=${id}`;

  return (
    <nav aria-label="Cartões">
      <div className="sm:hidden">
        <label htmlFor="card-select" className="sr-only">
          Cartão
        </label>
        <div className="flex items-center gap-1.5">
          <select
            id="card-select"
            value={selectedId}
            onChange={(e) => {
              const target = href(e.target.value);
              startTransition(() => {
                router.push(target);
              });
            }}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm dark:bg-input/30"
          >
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.institutionName}
              </option>
            ))}
          </select>
          {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />}
        </div>
      </div>

      <div className="hidden sm:inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {cards.map((c) => {
          const active = c.id === selectedId;
          return (
            <Link
              key={c.id}
              href={href(c.id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <CardTabInner color={c.institutionColor} name={c.name} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
