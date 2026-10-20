'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { PlusIcon, Trash2Icon } from 'lucide-react';
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
import { formatAmountInput, parseOptionalAmount } from '@/components/catalog/catalog-helpers';
import { formatBRL } from '@/server/domain/money';
import type { CategoryTree } from '@/server/queries/catalog';
import type { TransactionRow as Tx } from '@/server/queries/transaction-row';
import { splitTransactionAction } from '@/app/(app)/transacoes/actions';
import { CategoryPicker } from './category-picker';
import { CategoryBadgeContent, type BadgeCategory } from './category-badge';
import { categoryKindFor, type FlatCategory } from './tx-utils';

type SplitDialogProps = {
  tx: Tx;
  categories: CategoryTree[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type PartState = {
  id: string;
  amountStr: string;
  categoryId: string | null;
  categoryObj: BadgeCategory;
  description: string;
};

function parseInputCents(input: string): number {
  const parsed = parseOptionalAmount(input);
  if (parsed === null || parsed === undefined || parsed <= 0) return 0;
  return parsed;
}

function formatCentsToInput(cents: number): string {
  return formatAmountInput(cents);
}

export function SplitDialog({ tx, categories, open, onOpenChange, onSuccess }: SplitDialogProps) {
  const catKind = categoryKindFor(tx.kind) ?? 'expense';
  const targetCents = Math.abs(tx.amountCents);

  const [parts, setParts] = React.useState<PartState[]>(() => {
    const half = Math.floor(targetCents / 2);
    const rest = targetCents - half;
    return [
      {
        id: 'part-1',
        amountStr: formatCentsToInput(half),
        categoryId: tx.category?.id ?? null,
        categoryObj: tx.category
          ? { name: tx.category.name, color: tx.category.color, icon: tx.category.icon }
          : null,
        description: tx.description,
      },
      {
        id: 'part-2',
        amountStr: formatCentsToInput(rest),
        categoryId: null,
        categoryObj: null,
        description: tx.description,
      },
    ];
  });

  const [saving, startSave] = React.useTransition();

  const sumPartsCents = parts.reduce((sum, p) => sum + parseInputCents(p.amountStr), 0);
  const diffCents = targetCents - sumPartsCents;
  const hasZero = parts.some((p) => parseInputCents(p.amountStr) === 0);
  const isValid = diffCents === 0 && !hasZero && parts.length >= 2;

  const updatePart = (index: number, patch: Partial<PartState>) => {
    setParts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const addPart = () => {
    const remaining = Math.max(0, diffCents);
    setParts((prev) => [
      ...prev,
      {
        id: `part-${Date.now()}-${prev.length + 1}`,
        amountStr: remaining > 0 ? formatCentsToInput(remaining) : '0,00',
        categoryId: null,
        categoryObj: null,
        description: tx.description,
      },
    ]);
  };

  const removePart = (index: number) => {
    if (parts.length <= 2) return;
    setParts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCategorySelect = (index: number, cat: FlatCategory) => {
    updatePart(index, {
      categoryId: cat.id,
      categoryObj: { name: cat.name, color: cat.color, icon: cat.icon },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || saving) return;

    startSave(async () => {
      const res = await splitTransactionAction({
        transactionId: tx.id,
        parts: parts.map((p) => {
          const cents = parseInputCents(p.amountStr);
          return {
            amountCents: tx.amountCents < 0 ? -cents : cents,
            categoryId: p.categoryId,
            description: p.description.trim() || undefined,
          };
        }),
      });

      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }

      toast.success('Transação dividida com sucesso!');
      onOpenChange(false);
      onSuccess();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Dividir transação</DialogTitle>
          <DialogDescription>
            Divida o valor total de <strong className="text-foreground">{formatBRL(tx.amountCents)}</strong> em
            duas ou mais categorias ou descrições.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {parts.map((part, index) => (
              <div
                key={part.id}
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="w-full space-y-1 sm:w-28">
                  <Label htmlFor={`part-val-${part.id}`} className="text-xs text-muted-foreground">
                    Valor (R$)
                  </Label>
                  <Input
                    id={`part-val-${part.id}`}
                    value={part.amountStr}
                    onChange={(e) => updatePart(index, { amountStr: e.target.value })}
                    placeholder="0,00"
                    className="h-8 text-right font-mono text-sm"
                  />
                </div>

                <div className="flex-1 space-y-1">
                  <Label htmlFor={`part-desc-${part.id}`} className="text-xs text-muted-foreground">
                    Descrição
                  </Label>
                  <Input
                    id={`part-desc-${part.id}`}
                    value={part.description}
                    maxLength={200}
                    onChange={(e) => updatePart(index, { description: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>

                <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-start sm:justify-center">
                  <div className="space-y-1">
                    <span className="block text-xs text-muted-foreground">Categoria</span>
                    <CategoryPicker
                      categories={categories}
                      kind={catKind}
                      value={part.categoryId}
                      onSelect={(cat) => handleCategorySelect(index, cat)}
                      trigger={
                        <button
                          type="button"
                          className="inline-flex cursor-pointer items-center rounded-full hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Categoria da parte ${index + 1}`}
                        >
                          <CategoryBadgeContent category={part.categoryObj} />
                        </button>
                      }
                    />
                  </div>

                  {parts.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePart(index)}
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Remover parte ${index + 1}`}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={addPart} className="gap-1.5 text-xs">
              <PlusIcon className="size-3.5" />
              Adicionar parte
            </Button>

            <div className="text-right text-xs">
              {diffCents === 0 && !hasZero ? (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  ✓ Soma confere exatamente ({formatBRL(targetCents)})
                </span>
              ) : diffCents > 0 ? (
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  Faltam {formatBRL(diffCents)} para fechar o total
                </span>
              ) : (
                <span className="font-medium text-destructive">
                  Excedeu o total em {formatBRL(Math.abs(diffCents))}
                </span>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!isValid || saving}>
              {saving ? 'Dividindo...' : 'Confirmar divisão'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
