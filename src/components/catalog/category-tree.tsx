'use client';

import * as React from 'react';
import { ArchiveIcon, MoreVerticalIcon, PencilIcon, PlusIcon, RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { upsertCategoryAction } from '@/app/(app)/categorias/actions';
import type { CategoryKind } from '@/server/domain/enums';
import type { CategoryTree as CategoryNode } from '@/server/queries/catalog';
import { cn } from '@/lib/utils';
import { splitCategories, type ArchivedCategory } from './catalog-helpers';
import { ArchiveDialog } from './archive-dialog';
import { CategoryDialog, type CategoryDialogMode } from './category-dialog';
import { CategoryIcon } from './category-icon';

type CategoryTreeProps = { roots: CategoryNode[] };

function countLabel(n: number) {
  return `${n} ${n === 1 ? 'transação' : 'transações'}`;
}

/** Colunas Despesas/Receitas com a árvore de 2 níveis, diálogos e bloco de arquivadas. */
export function CategoryTree({ roots }: CategoryTreeProps) {
  const [dialog, setDialog] = React.useState<CategoryDialogMode | null>(null);
  const [archiving, setArchiving] = React.useState<CategoryNode | null>(null);
  const { expense, income, archived } = splitCategories(roots);

  const columns: Array<{ kind: CategoryKind; title: string; items: CategoryNode[] }> = [
    { kind: 'expense', title: 'Despesas', items: expense },
    { kind: 'income', title: 'Receitas', items: income },
  ];

  const actions = {
    edit: (category: CategoryNode) => setDialog({ type: 'edit', category }),
    addChild: (parent: CategoryNode) => setDialog({ type: 'create', kind: parent.kind, parent }),
    archive: (category: CategoryNode) => setArchiving(category),
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {columns.map((col) => (
          <Card key={col.kind} aria-label={col.title}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{col.title}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'create', kind: col.kind, parent: null })}>
                <PlusIcon />
                Nova categoria
              </Button>
            </CardHeader>
            <CardContent>
              {col.items.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma categoria ativa.</p>
              ) : (
                <ul className="divide-y">
                  {col.items.map((root) => (
                    <li key={root.id} className="py-1.5" data-testid="category-root" data-name={root.name}>
                      <CategoryRow category={root} actions={actions} />
                      {root.children.length > 0 && (
                        <ul className="ml-5 border-l pl-3">
                          {root.children.map((child) => (
                            <li key={child.id} data-testid="category-child" data-name={child.name}>
                              <CategoryRow category={child} actions={actions} child />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {archived.length > 0 && <ArchivedBlock archived={archived} />}

      <CategoryDialog mode={dialog} onClose={() => setDialog(null)} roots={roots} />
      <ArchiveDialog category={archiving} onClose={() => setArchiving(null)} roots={roots} />
    </div>
  );
}

type RowActions = {
  edit: (c: CategoryNode) => void;
  addChild: (c: CategoryNode) => void;
  archive: (c: CategoryNode) => void;
};

function CategoryRow({ category, actions, child = false }: { category: CategoryNode; actions: RowActions; child?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <CategoryIcon icon={category.icon} color={category.color} size={child ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <div className={cn('truncate', child ? 'text-sm' : 'text-sm font-medium')}>{category.name}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{countLabel(category.transactionCount)}</div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${category.name}`}>
              <MoreVerticalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => actions.edit(category)}>
            <PencilIcon />
            Editar
          </DropdownMenuItem>
          {!child && (
            <DropdownMenuItem onClick={() => actions.addChild(category)}>
              <PlusIcon />
              Nova subcategoria
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => actions.archive(category)}>
            <ArchiveIcon />
            Arquivar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ArchivedBlock({ archived }: { archived: ArchivedCategory[] }) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const restore = async (c: ArchivedCategory) => {
    setPendingId(c.id);
    const res = await upsertCategoryAction({
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      kind: c.kind,
      icon: c.icon,
      color: c.color,
      archived: false,
    });
    setPendingId(null);
    if (res.ok) toast.success(`Categoria "${c.name}" restaurada`);
    else toast.error(res.error.message);
  };

  return (
    <details className="group rounded-xl border bg-muted/30 p-4">
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
        Arquivadas ({archived.length})
      </summary>
      <ul className="mt-3 divide-y">
        {archived.map((c) => (
          <li key={c.id} className="flex items-center gap-2.5 py-2" data-testid="category-archived" data-name={c.name}>
            <CategoryIcon icon={c.icon} color={c.color} size="sm" className="opacity-60" />
            <div className="min-w-0 flex-1 text-sm">
              <span className="text-muted-foreground">{c.parentName ? `${c.parentName} › ` : ''}</span>
              {c.name}
              <span className="ml-2 text-xs text-muted-foreground">{c.kind === 'income' ? 'Receita' : 'Despesa'}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => restore(c)}
              disabled={pendingId === c.id || c.parentArchived}
              title={c.parentArchived ? `Restaure "${c.parentName}" antes` : undefined}
            >
              <RotateCcwIcon />
              Restaurar
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
