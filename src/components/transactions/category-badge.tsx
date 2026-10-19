'use client';

import * as React from 'react';
import {
  BriefcaseIcon,
  CarIcon,
  CircleHelpIcon,
  CirclePlusIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  HouseIcon,
  PawPrintIcon,
  PlaneIcon,
  ReceiptIcon,
  RepeatIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TagIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
  Undo2Icon,
  UtensilsIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CategorySource } from '@/server/domain/enums';
import { isAutoSuggestion, LOW_CONFIDENCE, suggestionLabel } from './tx-utils';

// Ícones usados pelo seed de categorias; nomes desconhecidos caem no ícone de etiqueta.
const ICONS: Record<string, LucideIcon> = {
  briefcase: BriefcaseIcon,
  car: CarIcon,
  'circle-help': CircleHelpIcon,
  'graduation-cap': GraduationCapIcon,
  'heart-pulse': HeartPulseIcon,
  home: HouseIcon,
  house: HouseIcon,
  'paw-print': PawPrintIcon,
  plane: PlaneIcon,
  'plus-circle': CirclePlusIcon,
  receipt: ReceiptIcon,
  repeat: RepeatIcon,
  'shopping-bag': ShoppingBagIcon,
  sparkles: SparklesIcon,
  tag: TagIcon,
  'trending-up': TrendingUpIcon,
  'undo-2': Undo2Icon,
  utensils: UtensilsIcon,
};

export function CategoryIcon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = ICONS[name] ?? TagIcon;
  return <Icon className={className} style={style} aria-hidden="true" />;
}

export type BadgeCategory = { name: string; color: string; icon: string } | null;

type CategoryBadgeProps = {
  category: BadgeCategory;
  source?: CategorySource;
  className?: string;
};

/** Visual do badge de categoria (sem comportamento: quem usa decide se é botão). */
export function CategoryBadgeContent({ category, source, className }: CategoryBadgeProps) {
  if (!category) {
    return (
      <span
        data-slot="category-badge"
        className={cn(
          'inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-muted-foreground/50 px-2 text-xs text-muted-foreground',
          className,
        )}
      >
        <TagIcon className="size-3" aria-hidden="true" />
        Sem categoria
      </span>
    );
  }
  const suggested = source ? isAutoSuggestion(source) : false;
  return (
    <span
      data-slot="category-badge"
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-xs font-medium',
        suggested && 'border-dashed',
        className,
      )}
      style={{ borderColor: `${category.color}80`, backgroundColor: `${category.color}1A` }}
    >
      <CategoryIcon name={category.icon} className="size-3 shrink-0" style={{ color: category.color }} />
      <span className="truncate">{category.name}</span>
    </span>
  );
}

/** Ícone de "sugestão automática" (IA/fonte) com tooltip; alerta quando a confiança é baixa. */
export function SuggestionHint({ source, confidence }: { source: CategorySource; confidence: number | null }) {
  if (!isAutoSuggestion(source)) return null;
  const low = confidence !== null && confidence < LOW_CONFIDENCE;
  const label = suggestionLabel(confidence);
  const Icon = low ? TriangleAlertIcon : SparklesIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            role="img"
            aria-label={label}
            className="inline-flex shrink-0 items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <Icon className={cn('size-3.5', low ? 'text-amber-500' : 'text-muted-foreground')} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
