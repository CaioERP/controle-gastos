'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { archiveCategoryAction } from '@/app/(app)/categorias/actions';
import type { CategoryTree } from '@/server/queries/catalog';
import { categoryOptionGroups } from './catalog-helpers';
import { CategorySelect } from './form-controls';

type ArchiveDialogProps = {
  category: CategoryTree | null;
  onClose: () => void;
  roots: CategoryTree[];
};

export function ArchiveDialog({ category, onClose, roots }: ArchiveDialogProps) {
  return (
    <Dialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {category && <ArchiveForm key={category.id} category={category} roots={roots} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ArchiveForm({ category, roots, onDone }: { category: CategoryTree; roots: CategoryTree[]; onDone: () => void }) {
  const [destination, setDestination] = React.useState('');
  const [isPending, startTransition] = React.useTransition();
  const activeChildren = category.children.filter((c) => !c.archived);
  const needsDestination = category.transactionCount > 0;

  // Destino: categorias ativas da mesma natureza, menos a própria
  const groups = categoryOptionGroups(roots, category.kind)
    .filter((g) => g.root.id !== category.id)
    .map((g) => ({ ...g, children: g.children.filter((c) => c.id !== category.id) }));

  const blocked = activeChildren.length > 0;
  const canSubmit = !blocked && (!needsDestination || destination !== '');

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await archiveCategoryAction({
        categoryId: category.id,
        moveTransactionsTo: needsDestination ? destination : null,
      });
      if (res.ok) {
        toast.success(`Categoria "${category.name}" arquivada`);
        onDone();
      } else {
        toast.error(res.error.message);
      }
    });
  };

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Arquivar &quot;{category.name}&quot;?</DialogTitle>
        <DialogDescription>
          A categoria some das listas e filtros, mas pode ser restaurada depois.
          {category.isSystem && ' Categorias do sistema podem ser arquivadas, mas não excluídas.'}
        </DialogDescription>
      </DialogHeader>

      {blocked ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          Esta categoria tem {activeChildren.length}{' '}
          {activeChildren.length === 1 ? 'subcategoria ativa' : 'subcategorias ativas'} (
          {activeChildren.map((c) => c.name).join(', ')}). Arquive as subcategorias antes.
        </p>
      ) : needsDestination ? (
        <div className="grid gap-1.5">
          <Label htmlFor="archive-destination">
            Mover {category.transactionCount} {category.transactionCount === 1 ? 'transação' : 'transações'} para
          </Label>
          <CategorySelect
            id="archive-destination"
            groups={groups}
            emptyLabel="Escolha a categoria de destino"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma transação usa esta categoria.</p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="button" variant="destructive" onClick={handleConfirm} disabled={!canSubmit || isPending}>
          {isPending ? 'Arquivando...' : 'Arquivar'}
        </Button>
      </DialogFooter>
    </div>
  );
}
