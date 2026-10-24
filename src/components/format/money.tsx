import * as React from 'react';
import { formatBRL } from '@/server/domain/money';
import { cn } from '@/lib/utils';

export interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  cents: number;
  signed?: boolean;
  colored?: boolean;
  tone?: 'performance' | 'flow';
  /**
   * Trocado por "R$ •••••" no modo "esconder valores" (padrão). Use `false` só em valores
   * soltos, como o de um lançamento individual; totais, saldos e limites ficam sensíveis.
   */
  sensitive?: boolean;
}

/**
 * Valor formatado fora do <Money> (cards, tooltips) que some no modo "esconder valores".
 * O texto fica no span interno; o CSS esconde esse span e põe a máscara no externo, que mantém
 * fonte e tamanho do lugar onde está.
 */
export function Sensitive({ children }: { children: React.ReactNode }) {
  return (
    <span data-sensitive>
      <span data-sensitive-value>{children}</span>
    </span>
  );
}

export function Money({
  cents,
  signed = false,
  colored = false,
  tone = 'performance',
  sensitive = true,
  className,
  ...props
}: MoneyProps) {
  const formatted = formatBRL(Math.abs(cents));
  const isPositive = cents > 0;
  const isNegative = cents < 0;

  let display = formatted;
  if (signed) {
    if (isPositive) display = `+${formatted}`;
    else if (isNegative) display = `-${formatted}`;
  } else if (cents < 0) {
    display = `-${formatted}`;
  }

  let colorClass = '';
  if (colored) {
    if (tone === 'flow') {
      colorClass = isPositive
        ? 'text-emerald-600 dark:text-emerald-400'
        : isNegative
          ? ''
          : 'text-muted-foreground';
    } else {
      colorClass = isPositive
        ? 'text-emerald-600 dark:text-emerald-400'
        : isNegative
          ? 'text-red-600 dark:text-red-400'
          : 'text-muted-foreground';
    }
  }

  return (
    <span
      className={cn('tabular-nums font-medium', colorClass, className)}
      data-sensitive={sensitive || undefined}
      {...props}
    >
      {sensitive ? <span data-sensitive-value>{display}</span> : display}
    </span>
  );
}
