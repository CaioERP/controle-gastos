import * as React from 'react';
import { cn } from '@/lib/utils';
import { hasCategoryOption, type CategoryOptionGroup } from './catalog-helpers';

/** Aviso abaixo do select quando a categoria escolhida está arquivada. */
export function ArchivedCategoryHint({ groups, value }: { groups: CategoryOptionGroup[]; value: string }) {
  if (hasCategoryOption(groups, value)) return null;
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400">
      A categoria atual está arquivada. Escolha outra ou restaure-a na aba Categorias.
    </p>
  );
}

/** Select nativo com o visual dos inputs (funciona bem no celular e com leitores de tela). */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}

type CategorySelectProps = Omit<React.ComponentProps<'select'>, 'children'> & {
  groups: CategoryOptionGroup[];
  /** Texto da opção vazia (ex.: "Nenhuma"). Sem ele, não há opção vazia. */
  emptyLabel?: string;
  /** Nome da categoria atual; se ela não estiver entre as ativas, vira a opção "<nome> (arquivada)". */
  currentLabel?: string;
};

/**
 * Categorias ativas agrupadas por categoria pai (a raiz também é selecionável).
 * Uma categoria atual arquivada aparece como opção extra, para o select não mostrar outra coisa.
 */
export function CategorySelect({ groups, emptyLabel, currentLabel, ...props }: CategorySelectProps) {
  const value = typeof props.value === 'string' ? props.value : '';
  const archived = !hasCategoryOption(groups, value);
  return (
    <NativeSelect {...props}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {archived && <option value={value}>{`${currentLabel ?? 'Categoria'} (arquivada)`}</option>}
      {groups.map((g) => (
        <optgroup key={g.root.id} label={g.root.label}>
          <option value={g.root.id}>{g.root.label}</option>
          {g.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  );
}
