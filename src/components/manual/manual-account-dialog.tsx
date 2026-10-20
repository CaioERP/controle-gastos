'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createManualAccountAction } from '@/app/(app)/contas/actions';
import { parseOptionalAmount } from '@/components/catalog/catalog-helpers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ACCOUNT_TYPE_LABELS } from '@/server/domain/labels';

const MANUAL_TYPES = [
  { value: 'wallet', label: 'Carteira (dinheiro)' },
  { value: 'checking', label: ACCOUNT_TYPE_LABELS.checking },
  { value: 'savings', label: ACCOUNT_TYPE_LABELS.savings },
  { value: 'credit_card', label: ACCOUNT_TYPE_LABELS.credit_card },
  { value: 'benefit', label: 'Vale-refeição/alimentação' },
  { value: 'investment', label: ACCOUNT_TYPE_LABELS.investment },
] as const;

type ManualType = (typeof MANUAL_TYPES)[number]['value'];

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export function ManualAccountDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<ManualType>('wallet');
  const [initialBalance, setInitialBalance] = React.useState('');
  const [closingDay, setClosingDay] = React.useState('3');
  const [dueDay, setDueDay] = React.useState('10');
  const [creditLimit, setCreditLimit] = React.useState('');
  const [loading, startTransition] = React.useTransition();

  const resetForm = () => {
    setName('');
    setType('wallet');
    setInitialBalance('');
    setClosingDay('3');
    setDueDay('10');
    setCreditLimit('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Informe o nome da conta');
      return;
    }

    let initialBalanceCents: number | undefined;
    let parsedClosingDay: number | null | undefined;
    let parsedDueDay: number | null | undefined;
    let creditLimitCents: number | null | undefined;

    if (type === 'credit_card') {
      const cDay = Number(closingDay);
      const dDay = Number(dueDay);
      if (!Number.isInteger(cDay) || cDay < 1 || cDay > 31) {
        toast.error('Informe um dia de fechamento entre 1 e 31');
        return;
      }
      if (!Number.isInteger(dDay) || dDay < 1 || dDay > 31) {
        toast.error('Informe um dia de vencimento entre 1 e 31');
        return;
      }
      parsedClosingDay = cDay;
      parsedDueDay = dDay;

      if (creditLimit.trim() !== '') {
        const parsedLimit = parseOptionalAmount(creditLimit);
        if (parsedLimit === undefined || (parsedLimit !== null && parsedLimit < 0)) {
          toast.error('Informe um limite de crédito válido');
          return;
        }
        creditLimitCents = parsedLimit;
      }
    } else if (initialBalance.trim() !== '') {
      const parsed = parseOptionalAmount(initialBalance);
      if (parsed === undefined) {
        toast.error('Informe um valor de saldo válido');
        return;
      }
      if (parsed !== null) {
        initialBalanceCents = parsed;
      }
    }

    startTransition(async () => {
      const res = await createManualAccountAction({
        name: trimmedName,
        type,
        initialBalanceCents,
        closingDay: parsedClosingDay,
        dueDay: parsedDueDay,
        creditLimitCents,
      });

      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }

      toast.success('Conta manual criada com sucesso');
      resetForm();
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm" className="gap-1.5">
            <Plus className="size-4" />
            <span>Nova conta manual</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conta manual</DialogTitle>
          <DialogDescription>
            Cadastre uma conta, cartão ou carteira para lançamentos e importações sem sincronização automática.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="manual-acc-name">Nome da conta *</Label>
            <Input
              id="manual-acc-name"
              placeholder="Ex.: Carteira de dinheiro"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-acc-type">Tipo</Label>
            <select
              id="manual-acc-type"
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value as ManualType)}
            >
              {MANUAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {type === 'credit_card' ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="manual-acc-closing-day">Dia de fechamento *</Label>
                  <Input
                    id="manual-acc-closing-day"
                    type="number"
                    min={1}
                    max={31}
                    placeholder="3"
                    value={closingDay}
                    onChange={(e) => setClosingDay(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="manual-acc-due-day">Dia de vencimento *</Label>
                  <Input
                    id="manual-acc-due-day"
                    type="number"
                    min={1}
                    max={31}
                    placeholder="10"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="manual-acc-limit">Limite total (R$)</Label>
                <Input
                  id="manual-acc-limit"
                  placeholder="0,00"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Opcional.</p>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="manual-acc-balance">Saldo inicial (R$)</Label>
              <Input
                id="manual-acc-balance"
                placeholder="0,00"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Opcional. Pode ser ajustado depois por lançamentos.</p>
            </div>
          )}

          <DialogFooter className="mt-6">
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={loading}>
                  Cancelar
                </Button>
              }
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Criar conta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
