'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateMerchantAction } from '@/app/(app)/categorias/actions';
import type { MerchantRow } from '@/server/queries/catalog';
import type { CategoryOptionGroup } from './catalog-helpers';
import { ArchivedCategoryHint, CategorySelect } from './form-controls';

type MerchantDialogProps = {
  merchant: MerchantRow | null;
  onClose: () => void;
  categoryGroups: CategoryOptionGroup[];
};

export function MerchantDialog({ merchant, onClose, categoryGroups }: MerchantDialogProps) {
  return (
    <Dialog open={merchant !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {merchant && (
          <MerchantForm key={merchant.id} merchant={merchant} categoryGroups={categoryGroups} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MerchantForm({
  merchant,
  categoryGroups,
  onDone,
}: {
  merchant: MerchantRow;
  categoryGroups: CategoryOptionGroup[];
  onDone: () => void;
}) {
  const [name, setName] = React.useState(merchant.name);
  const [categoryId, setCategoryId] = React.useState(merchant.defaultCategory?.id ?? '');
  const [isPending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return void toast.error('Informe o nome do estabelecimento');
    startTransition(async () => {
      const res = await updateMerchantAction({
        merchantId: merchant.id,
        patch: { name: trimmed, defaultCategoryId: categoryId || null },
      });
      if (res.ok) {
        toast.success('Estabelecimento atualizado');
        onDone();
      } else {
        toast.error(res.error.message);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Editar estabelecimento</DialogTitle>
        <DialogDescription>
          O nome de exibição aparece nas listas. A categoria padrão é sugerida para novas compras neste estabelecimento.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="merchant-name">Nome de exibição</Label>
        <Input id="merchant-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="merchant-category">Categoria padrão</Label>
        <CategorySelect
          id="merchant-category"
          groups={categoryGroups}
          emptyLabel="Nenhuma"
          currentLabel={merchant.defaultCategory?.name}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        />
        <ArchivedCategoryHint groups={categoryGroups} value={categoryId} />
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
