'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PAYMENT_METHODS, TX_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { RuleRow } from '@/server/queries/catalog';
import { formatAmountInput } from './catalog-helpers';
import { NativeSelect } from './form-controls';

export type AccountOption = { id: string; name: string };

/** Campos opcionais da regra, como texto do formulário (valores em reais, prioridade como string). */
export type RuleOptionalValues = {
  accountId: string;
  amountMin: string;
  amountMax: string;
  setKind: TxKind | '';
  setPayment: PaymentMethod | '';
  priority: string;
};

export function initialOptionalValues(rule: RuleRow | null): RuleOptionalValues {
  return {
    accountId: rule?.accountId ?? '',
    amountMin: formatAmountInput(rule?.amountMinCents ?? null),
    amountMax: formatAmountInput(rule?.amountMaxCents ?? null),
    setKind: rule?.setKind ?? '',
    setPayment: rule?.setPaymentMethod ?? '',
    priority: String(rule?.priority ?? 0),
  };
}

/** Abre recolhido numa regra nova; aberto se a regra editada usa algum campo opcional. */
export function hasOptionalValues(rule: RuleRow | null): boolean {
  return (
    rule !== null &&
    (rule.accountId !== null ||
      rule.amountMinCents !== null ||
      rule.amountMaxCents !== null ||
      rule.setKind !== null ||
      rule.setPaymentMethod !== null ||
      rule.priority !== 0)
  );
}

type RuleOptionalFieldsProps = {
  value: RuleOptionalValues;
  onChange: (patch: Partial<RuleOptionalValues>) => void;
  accounts: AccountOption[];
  defaultOpen: boolean;
};

export function RuleOptionalFields({ value, onChange, accounts, defaultOpen }: RuleOptionalFieldsProps) {
  return (
    <details className="rounded-lg border p-3" open={defaultOpen}>
      <summary className="cursor-pointer text-sm font-medium">Condições e ajustes opcionais</summary>
      <div className="mt-3 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="rule-account">Só na conta</Label>
          <NativeSelect id="rule-account" value={value.accountId} onChange={(e) => onChange({ accountId: e.target.value })}>
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
            <Input
              id="rule-min"
              inputMode="decimal"
              value={value.amountMin}
              onChange={(e) => onChange({ amountMin: e.target.value })}
              placeholder="10,00"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rule-max">Valor máximo (R$)</Label>
            <Input
              id="rule-max"
              inputMode="decimal"
              value={value.amountMax}
              onChange={(e) => onChange({ amountMax: e.target.value })}
              placeholder="1.000,00"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="rule-kind">Natureza</Label>
            <NativeSelect
              id="rule-kind"
              value={value.setKind}
              onChange={(e) => onChange({ setKind: e.target.value as TxKind | '' })}
            >
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
              value={value.setPayment}
              onChange={(e) => onChange({ setPayment: e.target.value as PaymentMethod | '' })}
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
            value={value.priority}
            onChange={(e) => onChange({ priority: e.target.value })}
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">Quando duas regras casam, vence a de maior prioridade.</p>
        </div>
      </div>
    </details>
  );
}
