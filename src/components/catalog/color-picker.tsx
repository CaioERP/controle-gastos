'use client';

import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 16 cores pré-definidas (Tailwind 500/600), legíveis com ícone branco nos dois temas. */
export const PRESET_COLORS = [
  { hex: '#EF4444', name: 'Vermelho' },
  { hex: '#F97316', name: 'Laranja' },
  { hex: '#F59E0B', name: 'Âmbar' },
  { hex: '#CA8A04', name: 'Amarelo' },
  { hex: '#84CC16', name: 'Lima' },
  { hex: '#16A34A', name: 'Verde' },
  { hex: '#10B981', name: 'Esmeralda' },
  { hex: '#14B8A6', name: 'Turquesa' },
  { hex: '#0EA5E9', name: 'Céu' },
  { hex: '#3B82F6', name: 'Azul' },
  { hex: '#6366F1', name: 'Índigo' },
  { hex: '#8B5CF6', name: 'Violeta' },
  { hex: '#D946EF', name: 'Fúcsia' },
  { hex: '#EC4899', name: 'Rosa' },
  { hex: '#A16207', name: 'Marrom' },
  { hex: '#64748B', name: 'Cinza' },
] as const;

type ColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
};

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const current = value.toUpperCase();
  return (
    <div role="radiogroup" aria-label="Cor" className="grid grid-cols-8 gap-1.5">
      {PRESET_COLORS.map((c) => {
        const selected = c.hex === current;
        return (
          <button
            key={c.hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c.name}
            title={c.name}
            onClick={() => onChange(c.hex)}
            className={cn(
              'flex aspect-square items-center justify-center rounded-full text-white ring-offset-2 ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'ring-2 ring-foreground',
            )}
            style={{ backgroundColor: c.hex }}
          >
            {selected && <CheckIcon className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
