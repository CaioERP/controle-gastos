'use client';

import * as React from 'react';
import { ListChecksIcon, SparklesIcon, UserIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type RecategorizeScope = 'this' | 'similar' | 'rule';

type RecategorizeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantName: string;
  categoryName: string;
  onChoose: (scope: RecategorizeScope) => void;
};

/**
 * Pergunta o alcance da recategorização. "Todas de <estabelecimento>" é o padrão (foco inicial),
 * então Enter confirma direto.
 */
export function RecategorizeDialog({
  open,
  onOpenChange,
  merchantName,
  categoryName,
  onChoose,
}: RecategorizeDialogProps) {
  const options: Array<{ scope: RecategorizeScope; title: string; hint: string; icon: React.ElementType }> = [
    { scope: 'similar', title: `Todas de ${merchantName}`, hint: 'Aplica às transações deste estabelecimento.', icon: ListChecksIcon },
    { scope: 'this', title: 'Só esta transação', hint: 'As demais ficam como estão.', icon: UserIcon },
    { scope: 'rule', title: 'Criar regra para as próximas', hint: 'Novas transações deste estabelecimento já chegam categorizadas.', icon: SparklesIcon },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aplicar “{categoryName}” a quais transações?</DialogTitle>
          <DialogDescription>Escolha o alcance da mudança de categoria.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2" role="group" aria-label="Alcance da mudança">
          {options.map((o, i) => {
            const Icon = o.icon;
            return (
              <button
                key={o.scope}
                type="button"
                autoFocus={i === 0}
                onClick={() => onChoose(o.scope)}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                  i === 0 && 'border-primary/60 bg-primary/5',
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{o.title}</span>
                  <span className="text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
