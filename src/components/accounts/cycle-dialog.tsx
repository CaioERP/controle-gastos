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

type CycleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  initialClosingDay: number | null;
  initialDueDay: number | null;
};

export function CycleDialog({
  open,
  onOpenChange,
  accountId,
  accountName,
  initialClosingDay,
  initialDueDay,
}: CycleDialogProps) {
  const [isPending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const c = parseInt(formData.get('closingDay') as string, 10);
    const d = parseInt(formData.get('dueDay') as string, 10);

    if (isNaN(c) || c < 1 || c > 31 || isNaN(d) || d < 1 || d > 31) {
      toast.error('Os dias devem ser números entre 1 e 31');
      return;
    }

    startTransition(async () => {
      const res = await updateAccountAction({
        accountId,
        patch: { closingDay: c, dueDay: d },
      });
      if (res.ok) {
        toast.success('Ciclo de fatura configurado com sucesso');
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
            <DialogTitle>Configurar ciclo da fatura</DialogTitle>
            <DialogDescription>
              Ajuste os dias de fechamento e vencimento para organizar as faturas de {accountName}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="closingDay" className="text-xs">Dia de Fechamento</Label>
              <Input
                id="closingDay"
                name="closingDay"
                type="number"
                min={1}
                max={31}
                defaultValue={initialClosingDay ?? ''}
                placeholder="Ex: 3"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDay" className="text-xs">Dia de Vencimento</Label>
              <Input
                id="dueDay"
                name="dueDay"
                type="number"
                min={1}
                max={31}
                defaultValue={initialDueDay ?? ''}
                placeholder="Ex: 10"
                required
              />
            </div>
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
