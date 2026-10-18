'use client';

import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon, LandmarkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { ACCOUNT_TYPE_LABELS } from '@/server/domain/labels';
import type { InstitutionWithAccounts } from '@/server/queries/accounts';
import { cn } from 'cn';

type ViewSelectorProps = {
  accounts: InstitutionWithAccounts[];
  institutionIds?: string[];
  accountIds?: string[];
  onChange: (view: { institutionIds?: string[]; accountIds?: string[] }) => void;
};

export function ViewSelector({
  accounts,
  institutionIds,
  accountIds,
  onChange,
}: ViewSelectorProps) {
  const [open, setOpen] = React.useState(false);

  // Determinar rótulo do botão
  const isAll = (!institutionIds || institutionIds.length === 0) && (!accountIds || accountIds.length === 0);

  let label = 'Tudo';
  if (!isAll) {
    if (institutionIds && institutionIds.length === 1 && (!accountIds || accountIds.length === 0)) {
      const inst = accounts.find((a) => a.institution.id === institutionIds[0]);
      label = inst ? inst.institution.name : '1 instituição';
    } else if (accountIds && accountIds.length === 1 && (!institutionIds || institutionIds.length === 0)) {
      const accId = accountIds[0];
      let foundAcc: { name: string; displayName: string | null } | null = null;
      let foundInstName = '';
      for (const inst of accounts) {
        const a = inst.accounts.find((acc) => acc.id === accId);
        if (a) {
          foundAcc = a;
          foundInstName = inst.institution.name;
          break;
        }
      }
      if (foundAcc) {
        label = `${foundInstName} · ${foundAcc.displayName ?? foundAcc.name}`;
      } else {
        label = '1 conta';
      }
    } else {
      const totalContas = (accountIds?.length ?? 0) + (institutionIds?.length ?? 0);
      label = `${totalContas} selecionados`;
    }
  }

  const handleSelectAll = () => {
    onChange({ institutionIds: undefined, accountIds: undefined });
    setOpen(false);
  };

  const handleSelectInstitution = (instId: string) => {
    // Se já estava selecionada, desmarca voltando para tudo
    if (institutionIds?.includes(instId) && !accountIds?.length) {
      onChange({ institutionIds: undefined, accountIds: undefined });
    } else {
      onChange({ institutionIds: [instId], accountIds: undefined });
    }
    setOpen(false);
  };

  const handleSelectAccount = (accId: string) => {
    // Se a conta já estava selecionada sozinha, desmarca
    if (accountIds?.length === 1 && accountIds[0] === accId && !institutionIds?.length) {
      onChange({ institutionIds: undefined, accountIds: undefined });
    } else {
      onChange({ institutionIds: undefined, accountIds: [accId] });
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-9 justify-between gap-2 border bg-card text-xs font-medium text-foreground hover:bg-muted/80 shadow-xs"
            aria-label="Seletor de visão"
          >
            <div className="flex items-center gap-1.5 truncate">
              <LandmarkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </div>
            <ChevronsUpDownIcon className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar instituição ou conta..." />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={handleSelectAll}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-foreground/40" />
                  <span className="font-medium">Tudo (todas as contas)</span>
                </div>
                {isAll && <CheckIcon className="h-4 w-4 text-primary" />}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />

            {accounts.map((inst) => {
              const isInstSelected = institutionIds?.includes(inst.institution.id) && !accountIds?.length;

              return (
                <CommandGroup
                  key={inst.institution.id}
                  heading={
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: inst.institution.color }}
                      />
                      <span>{inst.institution.name}</span>
                    </div>
                  }
                >
                  <CommandItem
                    onSelect={() => handleSelectInstitution(inst.institution.id)}
                    className="flex items-center justify-between cursor-pointer text-xs font-medium"
                  >
                    <span>Todas do {inst.institution.name}</span>
                    {isInstSelected && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
                  </CommandItem>

                  {inst.accounts.map((acc) => {
                    const isAccSelected = accountIds?.includes(acc.id);
                    const cardDigits = acc.cards?.length
                      ? acc.cards.map((c) => `•${c.last4}`).join(' ')
                      : null;

                    return (
                      <CommandItem
                        key={acc.id}
                        onSelect={() => handleSelectAccount(acc.id)}
                        className="flex items-center justify-between cursor-pointer text-xs pl-6"
                      >
                        <div className="flex flex-col truncate pr-2">
                          <span className={cn('truncate', isAccSelected && 'font-medium')}>
                            {acc.displayName ?? acc.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {ACCOUNT_TYPE_LABELS[acc.type]}
                            {cardDigits ? ` · ${cardDigits}` : ''}
                          </span>
                        </div>
                        {isAccSelected && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
