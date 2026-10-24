import * as React from 'react';
import Link from 'next/link';
import { formatDistanceToNow, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  CreditCard,
  ListChecks,
  Target,
} from 'lucide-react';
import type { AttentionItem } from '@/server/home/attention';
import { Money } from '@/components/format/money';
import { cn } from '@/lib/utils';

const JOB_LABELS: Record<string, string> = {
  'sync-all': 'sincronização',
  'prices-daily': 'cotações',
  'invoice-status': 'status das faturas',
  'connection-health': 'saúde das conexões',
  'net-worth-snapshot': 'patrimônio',
  'evaluate-alerts': 'alertas',
  'detect-recurrences': 'assinaturas',
};

function getAttentionIcon(item: AttentionItem) {
  switch (item.kind) {
    case 'review':
      return ListChecks;
    case 'invoice_due':
      return CreditCard;
    case 'connection':
      return AlertTriangle;
    case 'limit':
      return Target;
    case 'job_error':
      return AlertTriangle;
  }
}

function renderAttentionContent(item: AttentionItem, isMobile = false) {
  if (isMobile) {
    switch (item.kind) {
      case 'review':
        return `${item.count} para revisar`;
      case 'invoice_due':
        if (item.daysLeft === 0) return `Fatura ${item.accountName} hoje`;
        if (item.daysLeft === 1) return `Fatura ${item.accountName} amanhã`;
        if (item.daysLeft > 1) return `Fatura ${item.accountName} em ${item.daysLeft}d`;
        if (item.daysLeft === -1) return `Fatura ${item.accountName} venceu ontem`;
        return `Fatura ${item.accountName} venceu há ${Math.abs(item.daysLeft)}d`;
      case 'connection':
        return item.status === 'expired' || item.status === 'revoked'
          ? `${item.institutionName} reconectar`
          : `Erro ${item.institutionName}`;
      case 'limit':
        return item.spentPercent > 100
          ? `${item.name} ${item.spentPercent}%`
          : `${item.name} em ${item.spentPercent}%`;
    }
  }

  switch (item.kind) {
    case 'review':
      return (
        <span>
          {item.count} {item.count === 1 ? 'transação para revisar' : 'transações para revisar'}
        </span>
      );
    case 'invoice_due': {
      let dueText: string;
      if (item.daysLeft === 0) {
        dueText = 'vence hoje';
      } else if (item.daysLeft === 1) {
        dueText = 'vence em 1 dia';
      } else if (item.daysLeft > 1) {
        dueText = `vence em ${item.daysLeft} dias`;
      } else if (item.daysLeft === -1) {
        dueText = 'venceu há 1 dia';
      } else {
        dueText = `venceu há ${Math.abs(item.daysLeft)} dias`;
      }
      return (
        <span>
          Fatura {item.accountName}: <Money cents={item.totalCents} />, {dueText}
        </span>
      );
    }
    case 'connection': {
      const text =
        item.status === 'expired' || item.status === 'revoked'
          ? `${item.institutionName} precisa reconectar`
          : `Erro ao sincronizar ${item.institutionName}`;
      return <span>{text}</span>;
    }
    case 'limit': {
      const text =
        item.spentPercent > 100
          ? `Meta ${item.name} estourada (${item.spentPercent}%)`
          : `Meta ${item.name} em ${item.spentPercent}%`;
      return <span>{text}</span>;
    }
    case 'job_error': {
      const label = JOB_LABELS[item.job] ?? item.job;
      let timeText = '';
      try {
        const d = new Date(item.failedAt);
        if (isValid(d)) {
          timeText = ` há ${formatDistanceToNow(d, { locale: ptBR })}`;
        }
      } catch {
        // ignora erro de parse
      }
      return <span>Falha em {label}{timeText}</span>;
    }
  }
}

function getItemKey(item: AttentionItem, index: number): string {
  switch (item.kind) {
    case 'review':
      return `review-${index}`;
    case 'invoice_due':
      return `invoice-${item.invoiceId}`;
    case 'connection':
      return `conn-${item.connectionId}`;
    case 'limit':
      return `limit-${item.limitId}`;
    case 'job_error':
      return `job-error-${item.job}`;
  }
}

export type AttentionStripProps = {
  items: AttentionItem[];
  mode?: 'all' | 'desktop-only' | 'mobile-only';
  className?: string;
};

export function AttentionStrip({ items, mode = 'all', className }: AttentionStripProps) {
  if (items.length === 0) return null;

  const showDesktop = mode === 'all' || mode === 'desktop-only';
  const showMobile = mode === 'all' || mode === 'mobile-only';

  return (
    <aside aria-label="Precisa de você" className={cn('space-y-2', className)}>
      {/* Desktop: linha horizontal de chips clicáveis */}
      {showDesktop && (
        <div className="hidden md:flex flex-wrap items-center gap-2">
          {items.map((item, idx) => {
            const Icon = getAttentionIcon(item);
            const isCritical = item.kind === 'limit' && item.spentPercent > 100;
            return (
              <Link
                key={getItemKey(item, idx)}
                href={item.href}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  isCritical
                    ? 'border-red-500/30 bg-red-500/10 text-red-950 dark:text-red-200 hover:bg-red-500/20'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200 hover:bg-amber-500/20',
                )}
              >
                <Icon
                  className={cn(
                    'size-3.5 shrink-0',
                    isCritical
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-amber-700 dark:text-amber-400',
                  )}
                  aria-hidden
                />
                {renderAttentionContent(item, false)}
              </Link>
            );
          })}
        </div>
      )}

      {/* Celular: linha rolável na horizontal (snap-x) */}
      {showMobile && (
        <div
          className={cn(
            'md:hidden',
            'flex items-center gap-2 overflow-x-auto snap-x scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0',
          )}
        >
          {items.map((item, idx) => {
            const Icon = getAttentionIcon(item);
            const isCritical = item.kind === 'limit' && item.spentPercent > 100;
            return (
              <Link
                key={getItemKey(item, idx)}
                href={item.href}
                className={cn(
                  'snap-start shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium active:opacity-80 transition-colors',
                  isCritical
                    ? 'border-red-500/30 bg-red-500/10 text-red-950 dark:text-red-200'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200',
                )}
              >
                <Icon
                  className={cn(
                    'size-3.5 shrink-0',
                    isCritical
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-amber-700 dark:text-amber-400',
                  )}
                  aria-hidden
                />
                <span>{renderAttentionContent(item, true)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}
