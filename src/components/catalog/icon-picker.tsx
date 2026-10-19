'use client';

import { cn } from '@/lib/utils';
import { ICON_LABELS, PICKER_ICONS } from './category-icon';

type IconPickerProps = {
  value: string;
  onChange: (icon: string) => void;
  color: string;
};

/** Grade de ícones lucide pré-selecionados (radiogroup acessível por teclado com Tab). */
export function IconPicker({ value, onChange, color }: IconPickerProps) {
  return (
    <div role="radiogroup" aria-label="Ícone" className="grid grid-cols-8 gap-1.5">
      {(Object.keys(PICKER_ICONS) as Array<keyof typeof PICKER_ICONS>).map((name) => {
        const Icon = PICKER_ICONS[name];
        const label = ICON_LABELS[name];
        const selected = name === value;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => onChange(name)}
            className={cn(
              'flex aspect-square items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'border-transparent text-white',
            )}
            style={selected ? { backgroundColor: color } : undefined}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
