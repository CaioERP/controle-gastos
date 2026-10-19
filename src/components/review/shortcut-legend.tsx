import * as React from 'react';

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">{children}</kbd>;
}

/** Legenda visível dos atalhos da fila de revisão. */
export function ShortcutLegend() {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Atalhos de teclado">
      <span>
        <Kbd>Enter</Kbd> confirmar
      </span>
      <span>
        <Kbd>1</Kbd>–<Kbd>9</Kbd> categoria rápida (só esta transação)
      </span>
      <span>
        <Kbd>S</Kbd> pular
      </span>
      <span>
        <Kbd>T</Kbd> transferência
      </span>
      <span>
        <Kbd>C</Kbd> escolher outra
      </span>
    </p>
  );
}
