'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteRuleAction, upsertRuleAction } from '@/app/(app)/categorias/actions';
import type { RuleInput } from '@/server/commands/rules';
import type { RuleRow } from '@/server/queries/catalog';
import { appliedMessage, parseOptionalAmount, type CategoryOptionGroup } from './catalog-helpers';
import { ArchivedCategoryHint, CategorySelect, NativeSelect } from './form-controls';
import { RulePreview } from './rule-preview';
import {
  hasOptionalValues,
  initialOptionalValues,
  RuleOptionalFields,
  type AccountOption,
  type RuleOptionalValues,
} from './rule-optional-fields';

/** `rule === undefined`: fechado; `null`: nova regra; RuleRow: edição. */
type RuleDialogProps = {
  rule: RuleRow | null | undefined;
  onClose: () => void;
  categoryGroups: CategoryOptionGroup[];
  accounts: AccountOption[];
};

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

/** Valida os textos do formulário e monta a entrada do comando; devolve a mensagem de erro, se houver. */
function buildInput(
  rule: RuleRow | null,
  base: Pick<RuleInput, 'matchField' | 'matchType' | 'pattern' | 'setCategoryId'>,
  opt: RuleOptionalValues,
): RuleInput | string {
  const min = parseOptionalAmount(opt.amountMin);
  const max = parseOptionalAmount(opt.amountMax);
  const priority = Number(opt.priority);
  if (!base.pattern.trim()) return 'Informe o texto da condição';
  if (!base.setCategoryId) return 'Escolha a categoria';
  if (min === undefined || max === undefined) return 'Valor inválido. Use o formato 1.234,56';
  if (min !== null && max !== null && min > max) return 'O valor mínimo deve ser menor ou igual ao máximo';
  if (!Number.isInteger(priority)) return 'A prioridade deve ser um número inteiro';
  return {
    ...base,
    id: rule?.id,
    pattern: base.pattern.trim(),
    priority,
    accountId: opt.accountId || null,
    amountMinCents: min,
    amountMaxCents: max,
    setKind: opt.setKind || null,
    setPaymentMethod: opt.setPayment || null,
    enabled: rule?.enabled ?? true,
  };
}

function RuleForm({ rule, categoryGroups, accounts, onDone }: RuleFormProps) {
  const [matchField, setMatchField] = React.useState<RuleInput['matchField']>(rule?.matchField ?? 'description');
  const [matchType, setMatchType] = React.useState<RuleInput['matchType']>(rule?.matchType ?? 'contains');
  const [pattern, setPattern] = React.useState(rule?.pattern ?? '');
  const [categoryId, setCategoryId] = React.useState(rule?.setCategoryId ?? '');
  const [opt, setOpt] = React.useState(() => initialOptionalValues(rule));
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = buildInput(rule, { matchField, matchType, pattern, setCategoryId: categoryId }, opt);
    if (typeof input === 'string') return void toast.error(input);
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

      <RulePreview
        matchField={matchField}
        matchType={matchType}
        pattern={pattern}
        accountId={opt.accountId}
        amountMin={opt.amountMin}
        amountMax={opt.amountMax}
      />

      <div className="grid gap-1.5">
        <Label htmlFor="rule-category">Categoria</Label>
        <CategorySelect
          id="rule-category"
          groups={categoryGroups}
          emptyLabel="Escolha a categoria"
          currentLabel={rule?.categoryName}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        />
        <ArchivedCategoryHint groups={categoryGroups} value={categoryId} />
      </div>

      <RuleOptionalFields
        value={opt}
        onChange={(patch) => setOpt((o) => ({ ...o, ...patch }))}
        accounts={accounts}
        defaultOpen={hasOptionalValues(rule)}
      />

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
