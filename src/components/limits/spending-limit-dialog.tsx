'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Target } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  formatAmountInput,
  parseOptionalAmount,
  categoryOptionGroups,
} from '@/components/catalog/catalog-helpers';
import { LIMIT_PERIODS, PAYMENT_METHODS, type LimitPeriod, type PaymentMethod } from '@/server/domain/enums';
import { LIMIT_PERIOD_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { CategoryTree } from '@/server/queries/catalog';
import type { SpendingLimitRow } from '@/server/queries/limits';
import { upsertSpendingLimitAction } from '@/app/(app)/limites/actions';
import { cn } from '@/lib/utils';

export type AccountOption = {
  id: string;
  name: string;
};

type SpendingLimitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryTree[];
  accounts: AccountOption[];
  limit?: SpendingLimitRow | null;
  onSuccess?: () => void;
};

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export function MoneyInput({
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

type SpendingLimitFormProps = {
  limit?: SpendingLimitRow | null;
  categories: CategoryTree[];
  accounts: AccountOption[];
  onCancel: () => void;
  onSuccess: () => void;
};

function SpendingLimitForm({
  limit,
  categories,
  accounts,
  onCancel,
  onSuccess,
}: SpendingLimitFormProps) {
  const isEditing = Boolean(limit);

  const [name, setName] = React.useState(limit?.name ?? '');
  const [categoryId, setCategoryId] = React.useState(limit?.categoryId ?? '');
  const [paymentMethod, setPaymentMethod] = React.useState<string>(limit?.paymentMethod ?? '');
  const [accountId, setAccountId] = React.useState(limit?.accountId ?? '');
  const [period, setPeriod] = React.useState<LimitPeriod>(limit?.period ?? 'monthly');
  const [amountStr, setAmountStr] = React.useState(
    limit ? formatAmountInput(limit.amountCents) : '',
  );

  const initialThresholds = limit?.thresholds ?? [80, 100];
  const [notify80, setNotify80] = React.useState(initialThresholds.includes(80));
  const [notify100, setNotify100] = React.useState(initialThresholds.includes(100));
  const [notifyPace, setNotifyPace] = React.useState(limit?.notifyPace ?? true);

  const [errors, setErrors] = React.useState<{ name?: string; amount?: string }>({});
  const [isPending, startTransition] = React.useTransition();

  const expenseGroups = React.useMemo(
    () => categoryOptionGroups(categories, 'expense'),
    [categories],
  );

  function handleCategoryChange(newCatId: string) {
    setCategoryId(newCatId);
    if (!name.trim() && newCatId) {
      for (const group of expenseGroups) {
        if (group.root.id === newCatId) {
          setName(group.root.label);
          break;
        }
        const child = group.children.find((c) => c.id === newCatId);
        if (child) {
          setName(child.label.split(' › ')[1] || child.label);
          break;
        }
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: { name?: string; amount?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Nome da meta é obrigatório';
    }

    const parsedCents = parseOptionalAmount(amountStr);
    if (parsedCents === null || parsedCents === undefined || parsedCents <= 0) {
      newErrors.amount = 'Informe um valor limite válido maior que zero';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const thresholds: number[] = [];
    if (notify80) thresholds.push(80);
    if (notify100) thresholds.push(100);
    // Limiares fora de 80/100 (definidos fora do formulário) são preservados na edição.
    const extra = initialThresholds.filter((t) => t !== 80 && t !== 100);
    const merged = [...thresholds, ...extra].sort((a, b) => a - b);
    const finalThresholds = merged.length > 0 ? merged : [100];

    startTransition(async () => {
      try {
        const res = await upsertSpendingLimitAction({
          id: limit?.id,
          name: name.trim(),
          categoryId: categoryId || null,
          paymentMethod: (paymentMethod as PaymentMethod) || null,
          accountId: accountId || null,
          period,
          amountCents: parsedCents!,
          thresholds: finalThresholds,
          notifyPace,
          isActive: limit ? limit.isActive : true,
        });

        if (res.ok) {
          toast.success(isEditing ? 'Meta atualizada com sucesso' : 'Meta criada com sucesso');
          onSuccess();
        } else {
          toast.error(res.error.message || 'Erro ao salvar meta');
        }
      } catch {
        toast.error('Erro de conexão ao salvar meta');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      {/* Nome */}
      <div className="space-y-1.5">
        <Label htmlFor="limit-name" className="text-xs font-medium">
          Nome da meta *
        </Label>
        <Input
          id="limit-name"
          placeholder="Ex: Alimentação, Lazer no fim de semana"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
          className={cn(errors.name && 'border-destructive focus-visible:ring-destructive/20')}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {/* Categoria */}
      <div className="space-y-1.5">
        <Label htmlFor="limit-category" className="text-xs font-medium">
          Categoria (opcional)
        </Label>
        <select
          id="limit-category"
          className={selectClass}
          value={categoryId}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          <option value="">Qualquer categoria</option>
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

      {/* Grid: Forma de pagamento e Conta */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="limit-payment-method" className="text-xs font-medium">
            Forma de pagamento
          </Label>
          <select
            id="limit-payment-method"
            className={selectClass}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            <option value="">Qualquer forma</option>
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {PAYMENT_METHOD_LABELS[pm]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="limit-account" className="text-xs font-medium">
            Conta / Cartão
          </Label>
          <select
            id="limit-account"
            className={selectClass}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Qualquer conta</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid: Período e Valor limite */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="limit-period" className="text-xs font-medium">
            Período
          </Label>
          <select
            id="limit-period"
            className={selectClass}
            value={period}
            onChange={(e) => setPeriod(e.target.value as LimitPeriod)}
          >
            {LIMIT_PERIODS.map((p) => (
              <option key={p} value={p}>
                {LIMIT_PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="limit-amount" className="text-xs font-medium">
            Valor limite *
          </Label>
          <MoneyInput
            id="limit-amount"
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

      {/* Notificações e Alertas */}
      <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
        <span className="text-xs font-semibold text-foreground">Regras de Alerta</span>

        <div className="flex items-center gap-2">
          <Checkbox
            id="limit-notify-80"
            checked={notify80}
            onCheckedChange={(checked) => setNotify80(checked === true)}
          />
          <label htmlFor="limit-notify-80" className="text-xs cursor-pointer select-none">
            Avisar ao atingir 80% do limite
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="limit-notify-100"
            checked={notify100}
            onCheckedChange={(checked) => setNotify100(checked === true)}
          />
          <label htmlFor="limit-notify-100" className="text-xs cursor-pointer select-none">
            Avisar ao atingir 100% (limite estourado)
          </label>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <div className="space-y-0.5">
            <label htmlFor="limit-notify-pace" className="text-xs font-medium cursor-pointer">
              Alerta de ritmo acelerado
            </label>
            <p className="text-[11px] text-muted-foreground">
              Projeta o gasto diário e avisa se o teto for ultrapassado antes do fim do período.
            </p>
          </div>
          <Switch
            id="limit-notify-pace"
            checked={notifyPace}
            onCheckedChange={setNotifyPace}
            size="sm"
          />
        </div>
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
          {isPending ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Criar meta'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SpendingLimitDialog({
  open,
  onOpenChange,
  categories,
  accounts,
  limit,
  onSuccess,
}: SpendingLimitDialogProps) {
  const isEditing = Boolean(limit);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{isEditing ? 'Editar Meta de Gastos' : 'Nova Meta de Gastos'}</DialogTitle>
              <DialogDescription>
                Defina um limite de valor para acompanhar seu ritmo de consumo.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {open && (
          <SpendingLimitForm
            key={limit?.id ?? 'new'}
            limit={limit}
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
