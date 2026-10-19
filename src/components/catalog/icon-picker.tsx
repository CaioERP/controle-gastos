'use client';

import { cn } from '@/lib/utils';
import { PICKER_ICONS } from './category-icon';

type IconPickerProps = {
  value: string;
  onChange: (icon: string) => void;
  color: string;
};

/** Grade de ícones lucide pré-selecionados (radiogroup acessível por teclado com Tab). */
export function IconPicker({ value, onChange, color }: IconPickerProps) {
  return (
    <div role="radiogroup" aria-label="Ícone" className="grid grid-cols-8 gap-1.5">
      {Object.entries(PICKER_ICONS).map(([name, Icon]) => {
        const selected = name === value;
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            title={name}
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
