'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransactionRow } from '@/components/transactions/transaction-row';
import { TransactionSheet } from '@/components/transactions/transaction-sheet';
import type { RecategorizeHandler } from '@/components/transactions/category-cell';
import { pluralTransactions } from '@/components/transactions/tx-utils';
import { recategorizeAction } from '@/app/(app)/transacoes/actions';
import { toast } from 'sonner';
import type { CategoryTree, TagWithCount } from '@/server/queries/catalog';
import type { TransactionRow as Tx } from '@/server/queries/transaction-row';
import { withFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';

export type RecentTransactionsProps = {
  transactions: Tx[];
  categories: CategoryTree[];
  tags?: TagWithCount[];
  accountIds: string[];
  filters: TxFilters;
  className?: string;
};

export function RecentTransactions({
  transactions,
  categories,
  tags = [],
  accountIds,
  filters,
  className,
}: RecentTransactionsProps) {
  const router = useRouter();
  const [selectedTx, setSelectedTx] = React.useState<Tx | null>(null);

  const handleOpen = React.useCallback((tx: Tx) => {
    setSelectedTx(tx);
  }, []);

  const handleClose = React.useCallback(() => {
    setSelectedTx(null);
  }, []);

  const handleSaved = React.useCallback(() => {
    router.refresh();
    setSelectedTx(null);
  }, [router]);

  const handleRecategorize = React.useCallback<RecategorizeHandler>(
    (tx, cat, scope) => {
      void recategorizeAction({ transactionId: tx.id, categoryId: cat.id, scope }).then((res) => {
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
        toast.success(`Categoria atualizada em ${pluralTransactions(res.data.updated)}`);
        router.refresh();
      });
    },
    [router],
  );

  const viewAllHref = withFilters('/transacoes', { accountIds }, filters);

  return (
    <>
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Últimas transações da conta</CardTitle>
          <Link
            href={viewAllHref}
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <span>Ver todas</span>
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length > 0 ? (
            <ul className="divide-y divide-border/50">
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  categories={categories}
                  onOpen={handleOpen}
                  onRecategorize={handleRecategorize}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground p-4 text-center">
              Nenhuma transação recente nestas contas.
            </p>
          )}
        </CardContent>
      </Card>

      <TransactionSheet
        tx={selectedTx}
        categories={categories}
        tags={tags}
        onClose={handleClose}
        onSaved={handleSaved}
      />
    </>
  );
}
