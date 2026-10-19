'use client';

import * as React from 'react';
import { FilterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PAYMENT_METHODS, REPORTABLE_KINDS, TX_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { CategoryTree } from '@/server/queries/catalog';

type MoreFiltersProps = {
  paymentMethods?: PaymentMethod[];
  categoryIds?: string[];
  tagIds?: string[];
  kinds?: TxKind[];
  includeProjected?: boolean;
  needsReview?: boolean;
  categories: CategoryTree[];
  tags: Array<{ id: string; name: string; color: string }>;
  onChange: (patch: {
    paymentMethods?: PaymentMethod[];
    categoryIds?: string[];
    tagIds?: string[];
    kinds?: TxKind[];
    includeProjected?: boolean;
    needsReview?: boolean;
  }) => void;
};

export function MoreFilters({
  paymentMethods,
  categoryIds,
  tagIds,
  kinds,
  includeProjected,
  needsReview,
  categories,
  tags,
  onChange,
}: MoreFiltersProps) {
  const [open, setOpen] = React.useState(false);

  // Calcula contagem de filtros extras ativos
  let extraCount = 0;
  if (paymentMethods?.length) extraCount += paymentMethods.length;
  if (categoryIds?.length) extraCount += categoryIds.length;
  if (tagIds?.length) extraCount += tagIds.length;
  if (includeProjected) extraCount += 1;
  if (needsReview) extraCount += 1;

  const defaultKindsSet = new Set(REPORTABLE_KINDS);
  const isKindsModified =
    kinds &&
    (kinds.length !== defaultKindsSet.size || kinds.some((k) => !defaultKindsSet.has(k)));
  if (isKindsModified) extraCount += 1;

  const handleTogglePaymentMethod = (method: PaymentMethod) => {
    const current = paymentMethods ?? [];
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    onChange({ paymentMethods: next.length > 0 ? next : undefined });
  };

  const handleToggleCategory = (catId: string) => {
    const current = categoryIds ?? [];
    const next = current.includes(catId)
      ? current.filter((id) => id !== catId)
      : [...current, catId];
    onChange({ categoryIds: next.length > 0 ? next : undefined });
  };

  const handleToggleTag = (tagId: string) => {
    const current = tagIds ?? [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onChange({ tagIds: next.length > 0 ? next : undefined });
  };

  const handleToggleKind = (kind: TxKind) => {
    const current = kinds ?? [...REPORTABLE_KINDS];
    const next = current.includes(kind)
      ? current.filter((k) => k !== kind)
      : [...current, kind];
    onChange({ kinds: next.length > 0 ? next : undefined });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border bg-card text-xs font-medium text-foreground hover:bg-muted/80 shadow-xs"
            aria-label="Mais filtros"
          >
            <FilterIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>+ Filtros</span>
            {extraCount > 0 && (
              <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px] font-semibold">
                {extraCount}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-80 p-4 max-h-[85vh] overflow-y-auto" align="start">
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Formas de Pagamento
            </h4>
            <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
              {PAYMENT_METHODS.map((method) => {
                const checked = paymentMethods?.includes(method) ?? false;
                return (
                  <label
                    key={method}
                    className="flex items-center gap-2 text-xs py-0.5 cursor-pointer hover:text-foreground text-muted-foreground"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => handleTogglePaymentMethod(method)}
                    />
                    <span>{PAYMENT_METHOD_LABELS[method]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Categorias
            </h4>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {categories.map((cat) => {
                const isParentChecked = categoryIds?.includes(cat.id) ?? false;

                return (
                  <div key={cat.id} className="space-y-1">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <Checkbox
                        checked={isParentChecked}
                        onCheckedChange={() => handleToggleCategory(cat.id)}
                      />
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span>{cat.name}</span>
                    </label>

                    {cat.children && cat.children.length > 0 && (
                      <div className="pl-6 space-y-1">
                        {cat.children.map((sub) => {
                          const isSubChecked = categoryIds?.includes(sub.id) ?? false;
                          return (
                            <label
                              key={sub.id}
                              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                              <Checkbox
                                checked={isSubChecked}
                                onCheckedChange={() => handleToggleCategory(sub.id)}
                              />
                              <span
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: sub.color }}
                              />
                              <span>{sub.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {tags.length > 0 && (
            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Tags
              </h4>
              <div className="grid grid-cols-2 gap-1.5 max-h-28 overflow-y-auto pr-1">
                {tags.map((tag) => {
                  const checked = tagIds?.includes(tag.id) ?? false;
                  return (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 text-xs py-0.5 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => handleToggleTag(tag.id)}
                      />
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Natureza da Transação
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              {TX_KINDS.map((kind) => {
                const currentKinds = kinds ?? [...REPORTABLE_KINDS];
                const checked = currentKinds.includes(kind);
                return (
                  <label
                    key={kind}
                    className="flex items-center gap-2 text-xs py-0.5 cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => handleToggleKind(kind)}
                    />
                    <span>{KIND_LABELS[kind]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-3 space-y-3">
            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span className="font-medium text-foreground">Incluir parcelas futuras</span>
              <Switch
                checked={includeProjected ?? false}
                onCheckedChange={(checked) => onChange({ includeProjected: checked ? true : undefined })}
              />
            </label>

            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span className="font-medium text-foreground">Apenas pendentes de revisão</span>
              <Switch
                checked={needsReview ?? false}
                onCheckedChange={(checked) => onChange({ needsReview: checked ? true : undefined })}
              />
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
