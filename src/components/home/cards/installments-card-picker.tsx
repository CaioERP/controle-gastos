'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export type InstallmentsCardOption = { id: string; name: string; institutionName: string };

/** Escolhe o cartão do gráfico de parcelas; grava `parcelas` na URL e preserva aba e período. */
export function InstallmentsCardPicker({
  cards,
  selectedId,
}: {
  cards: InstallmentsCardOption[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function onChange(id: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (id) sp.set('parcelas', id);
    else sp.delete('parcelas');
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="installments-card" className="sr-only">
        Cartão das parcelas
      </label>
      <select
        id="installments-card"
        value={selectedId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-full rounded-lg border border-input bg-background px-2 text-xs dark:bg-input/30"
      >
        <option value="">Todos os cartões</option>
        {cards.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.institutionName}
          </option>
        ))}
      </select>
      {isPending && (
        <Loader2 className="size-3 animate-spin text-muted-foreground shrink-0" />
      )}
    </div>
  );
}
