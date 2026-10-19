'use client';

import * as React from 'react';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/states/empty-state';
import { upsertRuleAction } from '@/app/(app)/categorias/actions';
import type { RuleRow } from '@/server/queries/catalog';
import { describeRule, type CategoryOptionGroup } from './catalog-helpers';
import { RuleDialog, ruleToInput, type AccountOption } from './rule-dialog';

type RulesTableProps = {
  rules: RuleRow[];
  categoryGroups: CategoryOptionGroup[];
  accounts: AccountOption[];
};

const GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_10rem_5rem_6rem_5rem_4rem_2.5rem] md:items-center md:gap-3';

/** Uma lista só: grade de colunas no desktop, cartões empilhados no celular. */
export function RulesTable({ rules, categoryGroups, accounts }: RulesTableProps) {
  // undefined = diálogo fechado; null = nova regra
  const [editing, setEditing] = React.useState<RuleRow | null | undefined>(undefined);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rules.length} {rules.length === 1 ? 'regra' : 'regras'} · avaliadas da maior para a menor prioridade
        </p>
        <Button size="sm" onClick={() => setEditing(null)}>
          <PlusIcon />
          Nova regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="Nenhuma regra ainda"
          description="Crie regras para categorizar automaticamente as transações pela descrição ou pelo estabelecimento."
        />
      ) : (
        <div className="rounded-xl border">
          <div className={`hidden border-b px-4 py-2 text-xs font-medium text-muted-foreground ${GRID}`}>
            <span>Condição</span>
            <span>Categoria</span>
            <span className="text-right">Prioridade</span>
            <span>Origem</span>
            <span className="text-right">Acertos</span>
            <span>Ativa</span>
            <span className="sr-only">Editar</span>
          </div>
          <ul className="divide-y">
            {rules.map((rule) => (
              <RuleItem key={rule.id} rule={rule} onEdit={() => setEditing(rule)} />
            ))}
          </ul>
        </div>
      )}

      <RuleDialog rule={editing} onClose={() => setEditing(undefined)} categoryGroups={categoryGroups} accounts={accounts} />
    </div>
  );
}

function RuleItem({ rule, onEdit }: { rule: RuleRow; onEdit: () => void }) {
  const [isPending, startTransition] = React.useTransition();
  const d = describeRule(rule);
  const learned = rule.origin === 'learned';

  const toggle = (enabled: boolean) => {
    startTransition(async () => {
      const res = await upsertRuleAction({ ...ruleToInput(rule), enabled });
      if (res.ok) toast.success(enabled ? 'Regra ativada' : 'Regra desativada');
      else toast.error(res.error.message);
    });
  };

  return (
    <li data-testid="rule-row" className={`flex flex-col gap-2 px-4 py-3 ${GRID}`}>
      <div className="min-w-0 text-sm">
        {d.subject} {d.verb} <strong className="break-all font-semibold">{d.pattern}</strong>
        {d.extras.map((x) => (
          <span key={x} className="block text-xs text-muted-foreground">
            + {x}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:contents">
        <Badge variant="outline" className="max-w-full gap-1.5 truncate">
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: rule.categoryColor }} />
          {rule.categoryName}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums md:text-right md:text-sm md:text-foreground">
          <span className="md:hidden">Prioridade </span>
          {rule.priority}
        </span>
        <Badge variant={learned ? 'secondary' : 'outline'} className="w-fit">
          {learned ? 'Aprendida' : 'Manual'}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums md:text-right md:text-sm md:text-foreground">
          {rule.hitCount}
          <span className="md:hidden"> {rule.hitCount === 1 ? 'acerto' : 'acertos'}</span>
        </span>
        <span className="ml-auto flex items-center gap-2 md:ml-0">
          <Switch
            checked={rule.enabled}
            onCheckedChange={toggle}
            disabled={isPending}
            aria-label={rule.enabled ? 'Desativar regra' : 'Ativar regra'}
          />
          <span className="text-xs text-muted-foreground md:hidden">{rule.enabled ? 'Ativa' : 'Inativa'}</span>
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Editar regra ${d.pattern}`}>
          <PencilIcon />
        </Button>
      </div>
    </li>
  );
}
