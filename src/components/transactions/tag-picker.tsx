'use client';

import * as React from 'react';
import { PlusIcon, TagIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { TransactionTag } from '@/server/queries/transaction-row';

// Paleta para tags novas (o usuário ajusta a cor depois na tela de categorias).
const TAG_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6'];

export function nextTagColor(existing: number): string {
  return TAG_COLORS[existing % TAG_COLORS.length]!;
}

type TagPickerProps = {
  tags: TransactionTag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Cria a tag e devolve o registro, ou null se falhar. */
  onCreate: (name: string) => Promise<TransactionTag | null>;
};

export function TagPicker({ tags, selectedIds, onChange, onCreate }: TagPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [creating, startCreate] = React.useTransition();
  const selected = tags.filter((t) => selectedIds.includes(t.id));
  const term = search.trim();
  const exists = tags.some((t) => t.name.toLocaleLowerCase('pt-BR') === term.toLocaleLowerCase('pt-BR'));

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const create = () => {
    if (!term) return;
    startCreate(async () => {
      const tag = await onCreate(term.slice(0, 50));
      if (tag) {
        onChange([...selectedIds, tag.id]);
        setSearch('');
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((t) => (
        <span
          key={t.id}
          className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs"
          style={{ borderColor: `${t.color}80`, backgroundColor: `${t.color}1A` }}
        >
          {t.name}
          <button
            type="button"
            onClick={() => toggle(t.id)}
            aria-label={`Remover tag ${t.name}`}
            className="rounded-full outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="xs" aria-label="Adicionar tag">
              <TagIcon aria-hidden="true" />
              Tags
            </Button>
          }
        />
        <PopoverContent className="w-64 p-0" align="start">
          <Command label="Tags">
            <CommandInput
              placeholder="Buscar ou criar tag..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>{term ? 'Nenhuma tag com esse nome.' : 'Nenhuma tag ainda.'}</CommandEmpty>
              {tags.length > 0 && (
                <CommandGroup heading="Tags">
                  {tags.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      data-checked={selectedIds.includes(t.id)}
                      onSelect={() => toggle(t.id)}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                      {t.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {term && !exists && (
                <CommandGroup forceMount>
                  <CommandItem value={`__criar__${term}`} forceMount onSelect={create} disabled={creating}>
                    <PlusIcon aria-hidden="true" />
                    {creating ? 'Criando...' : `Criar tag “${term}”`}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
