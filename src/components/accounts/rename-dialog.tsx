'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateAccountAction } from '@/app/(app)/contas/actions';

type RenameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  originalName: string;
  currentDisplayName: string | null;
};

export function RenameDialog({
  open,
  onOpenChange,
  accountId,
  originalName,
  currentDisplayName,
}: RenameDialogProps) {
  const [isPending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = ((formData.get('displayName') as string) || '').trim();

    startTransition(async () => {
      const res = await updateAccountAction({
        accountId,
        patch: { displayName: name || null },
      });
      if (res.ok) {
        toast.success('Conta renomeada com sucesso');
        onOpenChange(false);
      } else {
        toast.error(res.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form key={`${accountId}-${open}`} onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Renomear conta</DialogTitle>
            <DialogDescription>
              Defina um apelido para a conta {originalName}. Deixe vazio para restaurar o nome padrão.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-1.5">
            <Label htmlFor="displayName" className="text-xs">Apelido da conta</Label>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              maxLength={100}
              defaultValue={currentDisplayName ?? ''}
              placeholder={originalName}
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
