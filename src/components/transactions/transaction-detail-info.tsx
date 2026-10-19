'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/format/money';
import { DateBR } from '@/components/format/date-br';
import { cn } from '@/lib/utils';
import { formatMonthBR } from '@/server/domain/dates';
import { INVOICE_STATUS_LABELS } from '@/server/domain/labels';
import type { TransactionRow as Tx } from '@/server/queries/transaction-row';
import { loadTransactionDetailAction } from '@/app/(app)/transacoes/actions';
import { CATEGORY_SOURCE_LABELS, formatConfidence, SOURCE_LABELS, TX_STATUS_LABELS } from './tx-utils';

type DetailData = Extract<Awaited<ReturnType<typeof loadTransactionDetailAction>>, { ok: true }>['data'];

/** Parte somente leitura do detalhe: origem, conta, fatura e parcelas. */
export function TransactionDetailInfo({ tx }: { tx: Tx }) {
  const [data, setData] = React.useState<DetailData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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

  return (
    <div className="space-y-4 border-t px-4 py-4 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <Info label="Descrição original">
          <span className="break-all font-mono text-xs">{tx.descriptionRaw}</span>
        </Info>
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
                  <Money cents={p.amountCents} />
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
