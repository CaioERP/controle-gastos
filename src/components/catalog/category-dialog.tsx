'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { upsertCategoryAction } from '@/app/(app)/categorias/actions';
import type { CategoryKind } from '@/server/domain/enums';
import type { CategoryTree } from '@/server/queries/catalog';
import { cn } from '@/lib/utils';
import { parentOptions } from './catalog-helpers';
import { ColorPicker, PRESET_COLORS } from './color-picker';
import { IconPicker } from './icon-picker';
import { NativeSelect } from './form-controls';

export type CategoryDialogMode =
  | { type: 'create'; kind: CategoryKind; parent: CategoryTree | null }
  | { type: 'edit'; category: CategoryTree };

type CategoryDialogProps = {
  mode: CategoryDialogMode | null;
  onClose: () => void;
  roots: CategoryTree[];
};

const KIND_OPTIONS: Array<{ value: CategoryKind; label: string }> = [
  { value: 'expense', label: 'Despesa' },
  { value: 'income', label: 'Receita' },
];

export function CategoryDialog({ mode, onClose, roots }: CategoryDialogProps) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        {mode && <CategoryForm key={formKey(mode)} mode={mode} roots={roots} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function formKey(mode: CategoryDialogMode): string {
  return mode.type === 'edit' ? `edit-${mode.category.id}` : `create-${mode.kind}-${mode.parent?.id ?? 'root'}`;
}

function CategoryForm({ mode, roots, onDone }: { mode: CategoryDialogMode; roots: CategoryTree[]; onDone: () => void }) {
  const editing = mode.type === 'edit' ? mode.category : null;
  const fixedParent = mode.type === 'create' ? mode.parent : null;
  // Usa o nó original de `roots` (a coluna mostra só filhas ativas): filha arquivada também impede
  // virar subcategoria, e o comando rejeitaria
  const hasChildren = editing !== null && (roots.find((r) => r.id === editing.id)?.children.length ?? 0) > 0;

  const [name, setName] = React.useState(editing?.name ?? '');
  const [kind, setKind] = React.useState<CategoryKind>(editing?.kind ?? (mode.type === 'create' ? mode.kind : 'expense'));
  const [parentId, setParentId] = React.useState<string | null>(editing?.parentId ?? fixedParent?.id ?? null);
  const [icon, setIcon] = React.useState(editing?.icon ?? fixedParent?.icon ?? 'tag');
  const [color, setColor] = React.useState(editing?.color ?? fixedParent?.color ?? PRESET_COLORS[9].hex);
  const [isPending, startTransition] = React.useTransition();

  // Natureza só é escolhida ao criar uma raiz; na edição é imutável e na subcategoria vem do pai
  const kindLocked = editing !== null || fixedParent !== null;
  const parents = parentOptions(roots, kind, editing?.id);

  const title = editing ? 'Editar categoria' : fixedParent ? `Nova subcategoria em ${fixedParent.name}` : 'Nova categoria';

  const handleKind = (next: CategoryKind) => {
    setKind(next);
    if (parentId && !parentOptions(roots, next).some((p) => p.id === parentId)) setParentId(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Informe o nome da categoria');
      return;
    }
    startTransition(async () => {
      const res = await upsertCategoryAction({ id: editing?.id, parentId, name: trimmed, kind, icon, color });
      if (res.ok) {
        toast.success(editing ? 'Categoria atualizada' : 'Categoria criada');
        onDone();
      } else {
        toast.error(res.error.message);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {editing ? 'A natureza (despesa ou receita) não muda depois de criada.' : 'Categorias têm no máximo 2 níveis.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="category-name">Nome</Label>
        <Input id="category-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Natureza</span>
        <div role="radiogroup" aria-label="Natureza" className="inline-flex w-fit rounded-lg border bg-muted/50 p-1">
          {KIND_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={kind === o.value}
              disabled={kindLocked && kind !== o.value}
              onClick={() => handleKind(o.value)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-all disabled:opacity-40',
                kind === o.value ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="category-parent">Categoria pai</Label>
        <NativeSelect
          id="category-parent"
          value={parentId ?? ''}
          disabled={hasChildren || fixedParent !== null}
          onChange={(e) => setParentId(e.target.value || null)}
        >
          <option value="">Nenhuma (categoria principal)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        {hasChildren && (
          <p className="text-xs text-muted-foreground">
            Categoria com subcategorias (inclusive arquivadas) não pode virar subcategoria.
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Ícone</span>
        <IconPicker value={icon} onChange={setIcon} color={color} />
      </div>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Cor</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
