'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteRuleAction, upsertRuleAction } from '@/app/(app)/categorias/actions';
import type { RuleInput } from '@/server/commands/rules';
import { PAYMENT_METHODS, TX_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { RuleRow } from '@/server/queries/catalog';
import { formatAmountInput, parseOptionalAmount, type CategoryOptionGroup } from './catalog-helpers';
import { CategorySelect, NativeSelect } from './form-controls';

export type AccountOption = { id: string; name: string };

/** `rule === undefined`: fechado; `null`: nova regra; RuleRow: edição. */
type RuleDialogProps = {
  rule: RuleRow | null | undefined;
  onClose: () => void;
  categoryGroups: CategoryOptionGroup[];
  accounts: AccountOption[];
};

export function appliedMessage(applied: number): string {
  return `Regra salva · ${applied} ${applied === 1 ? 'transação recategorizada' : 'transações recategorizadas'}`;
}

/** Linha da tabela → entrada do comando (usada também pelo switch "ativa"). */
export function ruleToInput(rule: RuleRow): RuleInput {
  return {
    id: rule.id,
    priority: rule.priority,
    matchField: rule.matchField,
    matchType: rule.matchType,
    pattern: rule.pattern,
    accountId: rule.accountId,
    amountMinCents: rule.amountMinCents,
    amountMaxCents: rule.amountMaxCents,
    setCategoryId: rule.setCategoryId,
    setKind: rule.setKind,
    setPaymentMethod: rule.setPaymentMethod,
    enabled: rule.enabled,
  };
}

export function RuleDialog({ rule, onClose, categoryGroups, accounts }: RuleDialogProps) {
  return (
    <Dialog open={rule !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        {rule !== undefined && (
          <RuleForm
            key={rule?.id ?? 'new'}
            rule={rule}
            categoryGroups={categoryGroups}
            accounts={accounts}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type RuleFormProps = Omit<RuleDialogProps, 'rule' | 'onClose'> & { rule: RuleRow | null; onDone: () => void };

function RuleForm({ rule, categoryGroups, accounts, onDone }: RuleFormProps) {
  const [matchField, setMatchField] = React.useState<RuleInput['matchField']>(rule?.matchField ?? 'description');
  const [matchType, setMatchType] = React.useState<RuleInput['matchType']>(rule?.matchType ?? 'contains');
  const [pattern, setPattern] = React.useState(rule?.pattern ?? '');
  const [accountId, setAccountId] = React.useState(rule?.accountId ?? '');
  const [amountMin, setAmountMin] = React.useState(formatAmountInput(rule?.amountMinCents ?? null));
  const [amountMax, setAmountMax] = React.useState(formatAmountInput(rule?.amountMaxCents ?? null));
  const [categoryId, setCategoryId] = React.useState(rule?.setCategoryId ?? '');
  const [setKind, setSetKind] = React.useState<TxKind | ''>(rule?.setKind ?? '');
  const [setPayment, setSetPayment] = React.useState<PaymentMethod | ''>(rule?.setPaymentMethod ?? '');
  const [priority, setPriority] = React.useState(String(rule?.priority ?? 0));
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const hasOptional =
    rule !== null &&
    (rule.accountId !== null ||
      rule.amountMinCents !== null ||
      rule.amountMaxCents !== null ||
      rule.setKind !== null ||
      rule.setPaymentMethod !== null ||
      rule.priority !== 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const min = parseOptionalAmount(amountMin);
    const max = parseOptionalAmount(amountMax);
    const prio = Number(priority);
    if (!pattern.trim()) return void toast.error('Informe o texto da condição');
    if (!categoryId) return void toast.error('Escolha a categoria');
    if (min === undefined || max === undefined) return void toast.error('Valor inválido. Use o formato 10,50');
    if (min !== null && max !== null && min > max) {
      return void toast.error('O valor mínimo deve ser menor ou igual ao máximo');
    }
    if (!Number.isInteger(prio)) return void toast.error('A prioridade deve ser um número inteiro');

    const input: RuleInput = {
      id: rule?.id,
      priority: prio,
      matchField,
      matchType,
      pattern: pattern.trim(),
      accountId: accountId || null,
      amountMinCents: min,
      amountMaxCents: max,
      setCategoryId: categoryId,
      setKind: setKind || null,
      setPaymentMethod: setPayment || null,
      enabled: rule?.enabled ?? true,
    };
    startTransition(async () => {
      const res = await upsertRuleAction(input);
      if (res.ok) {
        toast.success(appliedMessage(res.data.applied));
        onDone();
      } else {
        toast.error(res.error.message);
      }
    });
  };

  const handleDelete = () => {
    if (!rule) return;
    startTransition(async () => {
      const res = await deleteRuleAction({ ruleId: rule.id });
      if (res.ok) {
        toast.success('Regra excluída');
        onDone();
      } else {
        toast.error(res.error.message);
      }
    });
  };

  if (confirmingDelete) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Excluir esta regra?</DialogTitle>
          <DialogDescription>
            As transações já categorizadas continuam como estão. Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setConfirmingDelete(false)} disabled={isPending}>
            Voltar
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Excluindo...' : 'Confirmar exclusão'}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{rule ? 'Editar regra' : 'Nova regra'}</DialogTitle>
        <DialogDescription>Transações que casarem com a condição recebem a categoria escolhida.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="rule-field">Campo</Label>
          <NativeSelect
            id="rule-field"
            value={matchField}
            onChange={(e) => setMatchField(e.target.value as RuleInput['matchField'])}
          >
            <option value="description">Descrição</option>
            <option value="merchant">Estabelecimento</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rule-type">Comparação</Label>
          <NativeSelect
            id="rule-type"
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as RuleInput['matchType'])}
          >
            <option value="contains">Contém</option>
            <option value="starts_with">Começa com</option>
            <option value="equals">Igual a</option>
            <option value="regex">Expressão regular</option>
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="rule-pattern">Texto</Label>
        <Input
          id="rule-pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={matchType === 'regex' ? '^uber.*trip' : 'padaria'}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">Sem diferenciar maiúsculas nem acentos.</p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="rule-category">Categoria</Label>
        <CategorySelect
          id="rule-category"
          groups={categoryGroups}
          emptyLabel="Escolha a categoria"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        />
      </div>

      <details className="rounded-lg border p-3" open={hasOptional}>
        <summary className="cursor-pointer text-sm font-medium">Condições e ajustes opcionais</summary>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rule-account">Só na conta</Label>
            <NativeSelect id="rule-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Qualquer conta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-min">Valor mínimo (R$)</Label>
              <Input id="rule-min" inputMode="decimal" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="10,00" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-max">Valor máximo (R$)</Label>
              <Input id="rule-max" inputMode="decimal" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="50,00" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-kind">Natureza</Label>
              <NativeSelect id="rule-kind" value={setKind} onChange={(e) => setSetKind(e.target.value as TxKind | '')}>
                <option value="">Não alterar</option>
                {TX_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-payment">Forma de pagamento</Label>
              <NativeSelect
                id="rule-payment"
                value={setPayment}
                onChange={(e) => setSetPayment(e.target.value as PaymentMethod | '')}
              >
                <option value="">Não alterar</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-priority">Prioridade</Label>
            <Input
              id="rule-priority"
              type="number"
              step={1}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">Quando duas regras casam, vence a de maior prioridade.</p>
          </div>
        </div>
      </details>

      <DialogFooter className="sm:justify-between">
        {rule ? (
          <Button type="button" variant="destructive" onClick={() => setConfirmingDelete(true)} disabled={isPending}>
            Excluir
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar regra'}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
