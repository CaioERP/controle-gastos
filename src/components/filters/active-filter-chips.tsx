'use client';

import * as React from 'react';
import { XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { TxFilters } from '@/server/domain/filters';
import type { InstitutionWithAccounts } from '@/server/queries/accounts';
import type { CategoryTree } from '@/server/queries/catalog';

type ActiveFilterChipsProps = {
  filters: TxFilters;
  accounts: InstitutionWithAccounts[];
  categories: CategoryTree[];
  tags: Array<{ id: string; name: string; color: string }>;
  onRemove: (patch: Partial<TxFilters>) => void;
  onClear: () => void;
};

export function ActiveFilterChips({
  filters,
  accounts,
  categories,
  tags,
  onRemove,
  onClear,
}: ActiveFilterChipsProps) {
  const chips: Array<{ key: string; label: string; onRemove: () => void; color?: string }> = [];

  // 1. Instituições
  if (filters.institutionIds?.length) {
    for (const instId of filters.institutionIds) {
      const inst = accounts.find((a) => a.institution.id === instId);
      const name = inst ? inst.institution.name : 'Instituição';
      chips.push({
        key: `inst-${instId}`,
        label: name,
        color: inst?.institution.color,
        onRemove: () => {
          const next = filters.institutionIds?.filter((id) => id !== instId);
          onRemove({ institutionIds: next?.length ? next : undefined });
        },
      });
    }
  }

  // 2. Contas
  if (filters.accountIds?.length) {
    for (const accId of filters.accountIds) {
      let foundName = 'Conta';
      for (const inst of accounts) {
        const a = inst.accounts.find((acc) => acc.id === accId);
        if (a) {
          foundName = `${inst.institution.name}: ${a.displayName ?? a.name}`;
          break;
        }
      }
      chips.push({
        key: `acc-${accId}`,
        label: foundName,
        onRemove: () => {
          const next = filters.accountIds?.filter((id) => id !== accId);
          onRemove({ accountIds: next?.length ? next : undefined });
        },
      });
    }
  }

  // 3. Formas de pagamento
  if (filters.paymentMethods?.length) {
    for (const method of filters.paymentMethods) {
      chips.push({
        key: `pm-${method}`,
        label: PAYMENT_METHOD_LABELS[method] ?? method,
        onRemove: () => {
          const next = filters.paymentMethods?.filter((m) => m !== method);
          onRemove({ paymentMethods: next?.length ? next : undefined });
        },
      });
    }
  }

  // 3b. Natureza explícita (remover volta ao padrão da página)
  if (filters.kinds?.length) {
    chips.push({
      key: 'kinds',
      label: `Natureza: ${filters.kinds.map((k) => KIND_LABELS[k] ?? k).join(', ')}`,
      onRemove: () => onRemove({ kinds: undefined }),
    });
  }

  // 4. Categorias
  if (filters.categoryIds?.length) {
    const findCategory = (id: string, list: CategoryTree[]): CategoryTree | null => {
      for (const item of list) {
        if (item.id === id) return item;
        if (item.children?.length) {
          const child = findCategory(id, item.children);
          if (child) return child;
        }
      }
      return null;
    };

    for (const catId of filters.categoryIds) {
      const cat = findCategory(catId, categories);
      chips.push({
        key: `cat-${catId}`,
        label: cat?.name ?? 'Categoria',
        color: cat?.color,
        onRemove: () => {
          const next = filters.categoryIds?.filter((id) => id !== catId);
          onRemove({ categoryIds: next?.length ? next : undefined });
        },
      });
    }
  }

  // 5. Tags
  if (filters.tagIds?.length) {
    for (const tagId of filters.tagIds) {
      const tag = tags.find((t) => t.id === tagId);
      chips.push({
        key: `tag-${tagId}`,
        label: tag?.name ?? 'Tag',
        color: tag?.color,
        onRemove: () => {
          const next = filters.tagIds?.filter((id) => id !== tagId);
          onRemove({ tagIds: next?.length ? next : undefined });
        },
      });
    }
  }

  // 6. Busca
  if (filters.search) {
    chips.push({
      key: 'search',
      label: `"${filters.search}"`,
      onRemove: () => onRemove({ search: undefined }),
    });
  }

  // 7. Projetadas
  if (filters.includeProjected) {
    chips.push({
      key: 'projected',
      label: 'Com parcelas futuras',
      onRemove: () => onRemove({ includeProjected: undefined }),
    });
  }

  // 8. Revisão
  if (filters.needsReview) {
    chips.push({
      key: 'review',
      label: 'Para revisão',
      onRemove: () => onRemove({ needsReview: undefined }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs" data-slot="active-filter-chips">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="inline-flex items-center gap-1 py-0.5 px-2 text-xs font-normal bg-muted/80 hover:bg-muted"
        >
          {chip.color && (
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: chip.color }} />
          )}
          <span>{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 cursor-pointer"
            aria-label={`Remover filtro ${chip.label}`}
          >
            <XIcon className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground underline hover:no-underline"
      >
        Limpar
      </Button>
    </div>
  );
}
