'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Undo2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/format/money';
import { DateBR } from '@/components/format/date-br';
import { cn } from '@/lib/utils';
import { formatMonthBR } from '@/server/domain/dates';
import { formatBRL } from '@/server/domain/money';
import { INVOICE_STATUS_LABELS } from '@/server/domain/labels';
import type { TransactionRow as Tx } from '@/server/queries/transaction-row';
import { loadTransactionDetailAction, unsplitTransactionAction } from '@/app/(app)/transacoes/actions';
import { CategoryBadgeContent } from './category-badge';
import { CATEGORY_SOURCE_LABELS, formatConfidence, SOURCE_LABELS, TX_STATUS_LABELS } from './tx-utils';

type DetailData = Extract<Awaited<ReturnType<typeof loadTransactionDetailAction>>, { ok: true }>['data'];

/** Parte somente leitura do detalhe: origem, conta, fatura, parcelas e divisões. */
export function TransactionDetailInfo({ tx, onReload }: { tx: Tx; onReload?: () => void }) {
  const [data, setData] = React.useState<DetailData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [unsubmitting, startUnsplit] = React.useTransition();

  const loadData = React.useCallback(() => {
    loadTransactionDetailAction(tx.id).then((res) => {
      if (res.ok) setData(res.data);
      else setError(res.error.message);
    });
  }, [tx.id]);

  React.useEffect(() => {
    let active = true;
    loadTransactionDetailAction(tx.id).then((res) => {
      if (!active) return;
      if (res.ok) setData(res.data);
      else setError(res.error.message);
    });
    return () => {
      active = false;
    };
  }, [tx.id]);

  const handleUnsplit = () => {
    startUnsplit(async () => {
      const res = await unsplitTransactionAction({ transactionId: tx.id });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success('Divisão desfeita com sucesso!');
      loadData();
      onReload?.();
    });
  };

  return (
    <div className="space-y-4 border-t px-4 py-4 text-sm">
      {/* Aviso se a transação for filha */}
      {data?.parentTransaction && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <p className="font-semibold text-amber-700 dark:text-amber-400">
            Parte de divisão
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Esta transação é resultado de uma divisão de <strong>{data.parentTransaction.description}</strong> ({formatBRL(data.parentTransaction.amountCents)}).
          </p>
          <div className="mt-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unsubmitting}
              onClick={handleUnsplit}
              className="h-7 text-xs text-destructive hover:bg-destructive/10"
            >
              <Undo2Icon className="mr-1 size-3.5" />
              {unsubmitting ? 'Desfazendo...' : 'Desfazer divisão inteira'}
            </Button>
          </div>
        </div>
      )}

      {/* Lista de filhas se a transação for mãe com divisões ativas */}
      {data?.splitParts && data.splitParts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Divisões desta transação ({data.splitParts.length})
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={unsubmitting}
              onClick={handleUnsplit}
              className="h-6 px-2 text-xs text-destructive hover:bg-destructive/10"
            >
              <Undo2Icon className="mr-1 size-3" />
              {unsubmitting ? 'Desfazendo...' : 'Desfazer divisão'}
            </Button>
          </div>
          <ul className="divide-y rounded-lg border text-xs">
            {data.splitParts.map((part) => (
              <li key={part.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{part.description}</span>
                  <div className="flex items-center gap-1.5">
                    <CategoryBadgeContent category={part.category} />
                  </div>
                </div>
                <Money sensitive={false} cents={part.amountCents} className="font-semibold" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <Info label="Descrição original">
          <span className="break-all font-mono text-xs">{tx.descriptionRaw}</span>
        </Info>
        {tx.merchant && (
          <Info label="Estabelecimento">
            <Link
              href={`/estabelecimentos/${tx.merchant.id}`}
              className="text-primary underline-offset-4 hover:underline font-medium"
            >
              {tx.merchant.name}
            </Link>
          </Info>
        )}
        <Info label="Conta">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: tx.institution.color }} aria-hidden="true" />
            {tx.institution.name} · {tx.account.name}
          </span>
        </Info>
        {tx.card && (
          <Info label="Cartão">
            •{tx.card.last4}
            {tx.card.isVirtual ? ' (virtual)' : ''}
          </Info>
        )}
        {data?.invoice && (
          <Info label="Fatura">
            <Link
              href={`/faturas?cartao=${data.invoice.accountId}&fatura=${data.invoice.referenceMonth.slice(0, 7)}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {formatMonthBR(data.invoice.referenceMonth)}
            </Link>{' '}
            <span className="text-muted-foreground">
              · vence <DateBR date={data.invoice.dueDate} /> · {INVOICE_STATUS_LABELS[data.invoice.status]}
            </span>
          </Info>
        )}
        <Info label="Situação">{TX_STATUS_LABELS[tx.status]}</Info>
        <Info label="Origem da categoria">
          {CATEGORY_SOURCE_LABELS[tx.categorySource]}
          {tx.categoryConfidence !== null && tx.categorySource !== 'user' && (
            <span className="text-muted-foreground"> · confiança {formatConfidence(tx.categoryConfidence)}</span>
          )}
        </Info>
        <Info label="Origem dos dados">
          {data ? (
            data.detail.sources.length > 0 ? (
              <ul className="space-y-0.5">
                {data.detail.sources.map((s) => (
                  <li key={`${s.source}-${s.externalId}`}>{SOURCE_LABELS[s.source]}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">Lançamento sem fonte externa</span>
            )
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <Skeleton className="h-4 w-32" />
          )}
        </Info>
      </dl>

      {tx.installment && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Parcelas ({tx.installment.total})
          </h3>
          {data ? (
            <ul className="divide-y rounded-lg border">
              {data.installments.map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    'flex items-center justify-between gap-2 px-3 py-1.5 text-xs',
                    p.id === tx.id && 'bg-muted/60 font-medium',
                    p.status === 'projected' && 'italic text-muted-foreground',
                  )}
                >
                  <span className="tabular-nums">
                    {p.installment?.number}/{p.installment?.total}
                  </span>
                  <DateBR date={p.date} />
                  <Badge variant="outline">{TX_STATUS_LABELS[p.status]}</Badge>
                  <Money sensitive={false} cents={p.amountCents} />
                </li>
              ))}
            </ul>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
