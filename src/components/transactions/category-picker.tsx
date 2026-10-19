'use client';

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { CategoryKind } from '@/server/domain/enums';
import type { CategoryTree } from '@/server/queries/catalog';
import { CategoryIcon } from './category-badge';
import { categoryGroupsFor, type FlatCategory } from './tx-utils';

type CategoryPickerProps = {
  categories: CategoryTree[];
  /** Natureza de categoria aceita pela transação (ver `categoryKindFor`). */
  kind: CategoryKind;
  value?: string | null;
  onSelect: (category: FlatCategory) => void;
  /** Elemento que abre o seletor (ex.: o badge de categoria). */
  trigger: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Popover com busca, agrupado pela categoria pai, só com categorias da natureza compatível. */
export function CategoryPicker({
  categories,
  kind,
  value,
  onSelect,
  trigger,
  open: openProp,
  onOpenChange,
}: CategoryPickerProps) {
  const [openState, setOpenState] = React.useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const groups = React.useMemo(() => categoryGroupsFor(categories, kind), [categories, kind]);

  const choose = (cat: FlatCategory) => {
    setOpen(false);
    onSelect(cat);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-72 p-0" align="start">
        <Command
          label={kind === 'income' ? 'Categorias de receita' : 'Categorias de despesa'}
          // O filtro padrão do cmdk usa value + keywords; o value é o id, então buscamos pelos nomes.
          filter={(_value, search, keywords) => {
            const haystack = (keywords ?? []).join(' ').toLocaleLowerCase('pt-BR');
            return haystack.includes(search.toLocaleLowerCase('pt-BR')) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Buscar categoria..." />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.parent.id} heading={g.parent.name}>
                <CategoryOption
                  cat={g.parent}
                  label={g.children.length > 0 ? `${g.parent.name} (geral)` : g.parent.name}
                  keywords={[g.parent.name]}
                  selected={value === g.parent.id}
                  onSelect={choose}
                />
                {g.children.map((c) => (
                  <CategoryOption
                    key={c.id}
                    cat={c}
                    label={c.name}
                    keywords={[c.name, g.parent.name]}
                    selected={value === c.id}
                    onSelect={choose}
                    indent
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CategoryOption({
  cat,
  label,
  keywords,
  selected,
  onSelect,
  indent = false,
}: {
  cat: FlatCategory;
  label: string;
  keywords: string[];
  selected: boolean;
  onSelect: (cat: FlatCategory) => void;
  indent?: boolean;
}) {
  return (
    <CommandItem
      value={cat.id}
      keywords={keywords}
      data-checked={selected}
      onSelect={() => onSelect(cat)}
      className={indent ? 'pl-6' : undefined}
    >
      <CategoryIcon name={cat.icon} className="size-3.5" style={{ color: cat.color }} />
      <span className="truncate">{label}</span>
    </CommandItem>
  );
}
