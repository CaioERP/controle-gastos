import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getDb } from '@/server/db/client';
import { getHoldingDetail } from '@/server/queries/investments';
import { PageHeader } from '@/components/layout/page-header';
import { StatStrip } from '@/components/layout/stat-strip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Money } from '@/components/format/money';
import { DateBR } from '@/components/format/date-br';
import { formatQtyBR } from '@/server/investments/math';
import { ASSET_CLASS_LABELS, INVESTMENT_INDEXER_LABELS, INVESTMENT_TX_TYPE_LABELS } from '@/server/domain/labels';

export const dynamic = 'force-dynamic';

type HoldingDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function HoldingDetailPage({ params }: HoldingDetailPageProps) {
  const { id } = await params;
  const db = getDb();
  const holding = await getHoldingDetail(db, id);

  if (!holding) {
    notFound();
  }

  const profitPercent = (holding.profitBps / 100).toFixed(2).replace('.', ',');
  const profitBadge = `${holding.profitBps >= 0 ? '+' : ''}${profitPercent}%`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/investimentos"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
        >
          <ArrowLeft className="size-4" />
          <span>Voltar para investimentos</span>
        </Link>
      </div>

      <PageHeader
        title={holding.assetName}
        description={`Posição sob custódia em ${holding.institutionName} (${holding.accountName})`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {holding.ticker ? (
              <Badge variant="outline" className="font-mono text-sm">
                {holding.ticker}
              </Badge>
            ) : null}
            <Badge variant="secondary">
              {ASSET_CLASS_LABELS[holding.assetClass] ?? holding.assetClass}
            </Badge>
            {holding.isTaxExempt ? (
              <Badge
                variant="secondary"
                className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                Isento IR
              </Badge>
            ) : null}
          </div>
        }
      />

      {/* Resumo da posição em StatStrip */}
      <StatStrip
        items={[
          {
            label: 'Posição atual',
            value: <Money cents={holding.currentValueCents} />,
          },
          {
            label: 'Valor aplicado',
            value: <Money cents={holding.investedCents} />,
          },
          {
            label: 'Resultado',
            value: (
              <span className="flex items-baseline gap-2">
                <Money cents={holding.profitCents} signed colored />
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  ({profitBadge})
                </span>
              </span>
            ),
            tone: holding.profitBps >= 0 ? 'positive' : 'negative',
          },
          {
            label: 'Quantidade em custódia',
            value: <span className="font-mono">{formatQtyBR(holding.quantity)}</span>,
          },
        ]}
      />

      {/* Informações detalhadas do ativo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Detalhes do ativo</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Corretora / Instituição</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: holding.institutionColor }}
                />
                {holding.institutionName}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-muted-foreground">Conta</dt>
              <dd className="mt-1 font-medium">{holding.accountName}</dd>
            </div>

            <div>
              <dt className="text-xs text-muted-foreground">Indexador e Taxa</dt>
              <dd className="mt-1 font-medium">
                {holding.rateBps && holding.indexer
                  ? `${(holding.rateBps / 100).toFixed(2).replace('.', ',')}% (${INVESTMENT_INDEXER_LABELS[holding.indexer]})`
                  : holding.indexer
                    ? INVESTMENT_INDEXER_LABELS[holding.indexer]
                    : '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-muted-foreground">Data de vencimento</dt>
              <dd className="mt-1 font-medium">
                {holding.maturityDate ? <DateBR date={holding.maturityDate} /> : 'Sem vencimento'}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-muted-foreground">Preço médio de aquisição</dt>
              <dd className="mt-1 font-medium">
                {holding.averagePriceCents ? <Money sensitive={false} cents={holding.averagePriceCents} /> : '—'}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-muted-foreground">Origem dos dados</dt>
              <dd className="mt-1 font-medium capitalize">
                {holding.source === 'pluggy' ? 'Open Finance (Pluggy)' : 'Lançamento manual'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Histórico de movimentações / proventos da posição */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Movimentações e proventos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {holding.transactions.length === 0 ? (
            <div className="flex h-28 items-center justify-center p-4 text-sm text-muted-foreground">
              Nenhuma movimentação registrada para este ativo
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holding.transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs">
                        <DateBR date={tx.date} />
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {INVESTMENT_TX_TYPE_LABELS[tx.type] ?? tx.type}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tx.description ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">
                        {tx.quantity ? formatQtyBR(tx.quantity) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">
                        <Money sensitive={false} cents={tx.amountCents} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
