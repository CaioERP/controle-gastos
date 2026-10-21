'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  formatAmountInput,
  parseOptionalAmount,
  categoryOptionGroups,
} from '@/components/catalog/catalog-helpers';
import {
  PAYMENT_METHODS,
  RECURRENCE_FREQUENCIES,
  type PaymentMethod,
  type RecurrenceFrequency,
} from '@/server/domain/enums';
import {
  PAYMENT_METHOD_LABELS,
  RECURRENCE_FREQUENCY_LABELS,
} from '@/server/domain/labels';
import type { CategoryTree } from '@/server/queries/catalog';
import type { RecurrenceRow } from '@/server/queries/recurrences';
import { upsertRecurrenceAction } from '@/app/(app)/assinaturas/actions';
import { cn } from '@/lib/utils';

export type AccountOption = {
  id: string;
  name: string;
};

type RecurrenceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryTree[];
  accounts: AccountOption[];
  recurrence?: RecurrenceRow | null;
  onSuccess?: () => void;
};

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function MoneyInput({
  value,
  onChange,
  error,
  placeholder = '0,00',
  id,
}: {
  value: string;
  onChange: (val: string) => void;
  error?: boolean;
  placeholder?: string;
  id?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium select-none">
        R$
      </span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('pl-9', error && 'border-destructive focus-visible:ring-destructive/20')}
      />
    </div>
  );
}

type RecurrenceFormProps = {
  recurrence?: RecurrenceRow | null;
  categories: CategoryTree[];
  accounts: AccountOption[];
  onCancel: () => void;
  onSuccess: () => void;
};

function RecurrenceForm({
  recurrence,
  categories,
  accounts,
  onCancel,
  onSuccess,
}: RecurrenceFormProps) {
  const isEditing = Boolean(recurrence);

  const [description, setDescription] = React.useState(recurrence?.description ?? '');
  const [categoryId, setCategoryId] = React.useState(recurrence?.categoryId ?? '');
  const [accountId, setAccountId] = React.useState(recurrence?.accountId ?? '');
  const [paymentMethod, setPaymentMethod] = React.useState<string>(recurrence?.paymentMethod ?? '');
  const [frequency, setFrequency] = React.useState<RecurrenceFrequency>(
    recurrence?.frequency ?? 'monthly',
  );
  const [expectedDay, setExpectedDay] = React.useState<string>(
    recurrence?.expectedDay ? recurrence.expectedDay.toString() : '',
  );
  const [amountStr, setAmountStr] = React.useState(
    recurrence ? formatAmountInput(recurrence.amountCents) : '',
  );
  const [isSubscription, setIsSubscription] = React.useState(
    recurrence?.isSubscription ?? true,
  );

  const [errors, setErrors] = React.useState<{ description?: string; amount?: string; day?: string }>({});
  const [isPending, startTransition] = React.useTransition();

  const expenseGroups = React.useMemo(
    () => categoryOptionGroups(categories, 'expense'),
    [categories],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: { description?: string; amount?: string; day?: string } = {};

    if (!description.trim()) {
      newErrors.description = 'Descrição é obrigatória';
    }

    const parsedCents = parseOptionalAmount(amountStr);
    if (parsedCents === null || parsedCents === undefined || parsedCents <= 0) {
      newErrors.amount = 'Informe um valor válido maior que zero';
    }

    let parsedDay: number | null = null;
    if (expectedDay.trim()) {
      const dayNum = parseInt(expectedDay, 10);
      if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
        newErrors.day = 'Dia do mês deve ser entre 1 e 31';
      } else {
        parsedDay = dayNum;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    startTransition(async () => {
      try {
        const res = await upsertRecurrenceAction({
          id: recurrence?.id,
          description: description.trim(),
          categoryId: categoryId || null,
          accountId: accountId || null,
          paymentMethod: (paymentMethod as PaymentMethod) || null,
          frequency,
          expectedDay: parsedDay,
          amountCents: parsedCents!,
          isSubscription,
          status: recurrence ? recurrence.status : 'active',
          autoDetected: recurrence ? recurrence.autoDetected : false,
        });

        if (res.ok) {
          toast.success(
            isEditing
              ? 'Recorrência atualizada com sucesso'
              : 'Recorrência cadastrada com sucesso',
          );
          onSuccess();
        } else {
          toast.error(res.error.message || 'Erro ao salvar recorrência');
        }
      } catch {
        toast.error('Erro de conexão ao salvar recorrência');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      {/* Descrição */}
      <div className="space-y-1.5">
        <Label htmlFor="rec-description" className="text-xs font-medium">
          Descrição / Serviço *
        </Label>
        <Input
          id="rec-description"
          placeholder="Ex: Netflix, Aluguel, Academia"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
          }}
          className={cn(errors.description && 'border-destructive focus-visible:ring-destructive/20')}
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
      </div>

      {/* Categoria */}
      <div className="space-y-1.5">
        <Label htmlFor="rec-category" className="text-xs font-medium">
          Categoria
        </Label>
        <select
          id="rec-category"
          className={selectClass}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Sem categoria</option>
          {expenseGroups.map((group) => (
            <optgroup key={group.root.id} label={group.root.label}>
              <option value={group.root.id}>{group.root.label} (todas)</option>
              {group.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Grid: Forma de Pagamento e Conta */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rec-payment-method" className="text-xs font-medium">
            Forma de pagamento
          </Label>
          <select
            id="rec-payment-method"
            className={selectClass}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option value="">Indefinida</option>
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {PAYMENT_METHOD_LABELS[pm]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-account" className="text-xs font-medium">
            Conta / Cartão
          </Label>
          <select
            id="rec-account"
            className={selectClass}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Indefinida</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid: Frequência, Dia do Mês e Valor */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="rec-frequency" className="text-xs font-medium">
            Frequência
          </Label>
          <select
            id="rec-frequency"
            className={selectClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
          >
            {RECURRENCE_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {RECURRENCE_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-day" className="text-xs font-medium">
            Dia previsto
          </Label>
          <Input
            id="rec-day"
            type="number"
            min={1}
            max={31}
            placeholder="Ex: 10"
            value={expectedDay}
            onChange={(e) => {
              setExpectedDay(e.target.value);
              if (errors.day) setErrors((prev) => ({ ...prev, day: undefined }));
            }}
            className={cn(errors.day && 'border-destructive focus-visible:ring-destructive/20')}
          />
          {errors.day && <p className="text-xs text-destructive">{errors.day}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-amount" className="text-xs font-medium">
            Valor *
          </Label>
          <MoneyInput
            id="rec-amount"
            value={amountStr}
            onChange={(val) => {
              setAmountStr(val);
              if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
            }}
            error={Boolean(errors.amount)}
          />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
        </div>
      </div>

      {/* Switch Assinatura */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
        <div className="space-y-0.5">
          <label htmlFor="rec-is-sub" className="text-xs font-medium cursor-pointer">
            É uma assinatura de serviço
          </label>
          <p className="text-[11px] text-muted-foreground">
            Marque para serviços contínuos (streaming, academia, software etc.).
          </p>
        </div>
        <Switch
          id="rec-is-sub"
          checked={isSubscription}
          onCheckedChange={setIsSubscription}
          size="sm"
        />
      </div>

      <DialogFooter className="gap-2 sm:gap-0 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RecurrenceDialog({
  open,
  onOpenChange,
  categories,
  accounts,
  recurrence,
  onSuccess,
}: RecurrenceDialogProps) {
  const isEditing = Boolean(recurrence);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Repeat className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>
                {isEditing ? 'Editar Assinatura / Recorrência' : 'Nova Assinatura / Recorrência'}
              </DialogTitle>
              <DialogDescription>
                Cadastre despesas fixas ou serviços recorrentes para controle de compromissos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {open && (
          <RecurrenceForm
            key={recurrence?.id ?? 'new'}
            recurrence={recurrence}
            categories={categories}
            accounts={accounts}
            onCancel={() => onOpenChange(false)}
            onSuccess={() => {
              onOpenChange(false);
              onSuccess?.();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
