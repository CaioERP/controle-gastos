import * as React from 'react';
import Link from 'next/link';
import { formatDistanceToNow, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  ChevronRight,
  CreditCard,
  ListChecks,
  Target,
} from 'lucide-react';
import type { AttentionItem } from '@/server/home/attention';
import { Money } from '@/components/format/money';

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

function renderAttentionContent(item: AttentionItem) {
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

export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;

  return (
    <aside aria-label="Precisa de você" className="space-y-2">
      {/* Desktop: linha horizontal de chips clicáveis */}
      <div className="hidden md:flex flex-wrap items-center gap-2">
        {items.map((item, idx) => {
          const Icon = getAttentionIcon(item);
          return (
            <Link
              key={getItemKey(item, idx)}
              href={item.href}
              className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-950 dark:text-amber-200 hover:bg-amber-500/20 transition-colors"
            >
              <Icon className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
              {renderAttentionContent(item)}
            </Link>
          );
        })}
      </div>

      {/* Celular: lista vertical compacta com seta */}
      <div className="md:hidden flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 bg-card text-card-foreground overflow-hidden">
        {items.map((item, idx) => {
          const Icon = getAttentionIcon(item);
          return (
            <Link
              key={getItemKey(item, idx)}
              href={item.href}
              className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs font-medium hover:bg-muted/50 transition-colors active:bg-muted"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <div className="truncate">{renderAttentionContent(item)}</div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
