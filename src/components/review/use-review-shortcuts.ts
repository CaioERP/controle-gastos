'use client';

import * as React from 'react';
import { categoryKindFor, type FlatCategory } from '@/components/transactions/tx-utils';
import type { TransactionRow } from '@/server/queries/transaction-row';
import { hasSuggestion } from './review-card';

type ShortcutHandlers = {
  /** Card que recebe os atalhos; null desliga tudo. */
  active: TransactionRow | null;
  disabled: boolean;
  quick: FlatCategory[];
  quickAllowed: boolean;
  onConfirm: (tx: TransactionRow) => void;
  onMarkReviewed: (tx: TransactionRow) => void;
  onOpenPicker: (tx: TransactionRow) => void;
  onQuick: (cat: FlatCategory) => void;
  onSkip: (tx: TransactionRow) => void;
  onTransfer: (tx: TransactionRow) => void;
};

function isTypingTarget(el: HTMLElement): boolean {
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

/** Atalhos da fila: Enter confirmar · 1–9 categoria rápida · S pular · T transferência · C escolher outra. */
export function useReviewShortcuts(h: ShortcutHandlers) {
  const { active, disabled, quick, quickAllowed, onConfirm, onMarkReviewed, onOpenPicker, onQuick, onSkip, onTransfer } = h;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement;
      if (isTypingTarget(target)) return;
      // Com seletor, diálogo ou painel aberto, as teclas pertencem a ele.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (!active || disabled) return;
      const key = e.key.toLowerCase();
      if (key === 'enter') {
        if (target.closest('button, a')) return; // Enter num botão focado mantém o comportamento nativo
        e.preventDefault();
        if (hasSuggestion(active)) onConfirm(active);
        else if (!categoryKindFor(active.kind)) onMarkReviewed(active);
        else onOpenPicker(active);
      } else if (/^[1-9]$/.test(key)) {
        const cat = quick[Number(key) - 1];
        if (cat && quickAllowed) {
          e.preventDefault();
          onQuick(cat);
        }
      } else if (key === 's') {
        e.preventDefault();
        onSkip(active);
      } else if (key === 't') {
        if (active.kind === 'transfer') return;
        e.preventDefault();
        onTransfer(active);
      } else if (key === 'c') {
        if (!categoryKindFor(active.kind)) return;
        e.preventDefault();
        onOpenPicker(active);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, disabled, quick, quickAllowed, onConfirm, onMarkReviewed, onOpenPicker, onQuick, onSkip, onTransfer]);
}
