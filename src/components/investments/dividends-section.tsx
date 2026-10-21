'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Money, Sensitive } from '@/components/format/money';
import { DateBR } from '@/components/format/date-br';
import { formatBRL } from '@/server/domain/money';
import { formatBRLCompact } from '@/components/charts/format';
import { deleteInvestmentTransactionAction } from '@/app/(app)/investimentos/actions';
import { InvestmentTxDialog } from './investment-tx-dialog';
import type { DividendsOverview } from '@/server/queries/investments';

type DividendsSectionProps = {
  overview: DividendsOverview;
  holdings: Array<{ id: string; assetName: string; ticker: string | null; institutionName: string }>;
};

const chartConfig: ChartConfig = {
  total: {
    label: 'Proventos',
    color: '#10B981',
  },
};

const MONTH_NAMES = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

function formatMonthLabel(monthIso: string): string {
  const parts = monthIso.split('-');
  const y = parts[0]?.slice(2) ?? '';
  const m = parseInt(parts[1] ?? '1', 10) - 1;
  return `${MONTH_NAMES[m] ?? ''}/${y}`;
}

export function DividendsSection({ overview, holdings }: DividendsSectionProps) {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const chartData = overview.monthlyTotals.map((m) => ({
    month: m.month,
    label: formatMonthLabel(m.month),
    totalCents: m.totalCents,
  }));
  const hasChartData = chartData.some((m) => m.totalCents !== 0);

  const handleDelete = (txId: string, description: string | null) => {
    if (!confirm(`Deseja excluir o lançamento de provento "${description ?? 'Provento'}"?`)) {
      return;
    }
    setDeletingId(txId);
    void (async () => {
      try {
        const res = await deleteInvestmentTransactionAction({ investmentTransactionId: txId });
        if (res.ok) {
          toast.success('Lançamento excluído com sucesso');
        } else {
          toast.error(res.error.message || 'Erro ao excluir');
        }
      } finally {
        setDeletingId(null);
      }
    })();
  };

  return (
    <div className="space-y-6">
      {/* Cards de resumo de proventos e botão de ação */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 flex-1">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total em 12 meses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Money cents={overview.total12mCents} className="text-2xl font-bold" />
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Média mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Money cents={overview.averageMonthlyCents} className="text-2xl font-bold" />
            </CardContent>
          </Card>
        </div>

        {holdings.length > 0 ? (
          <div className="shrink-0 self-start sm:self-center">
            <InvestmentTxDialog
              holdings={holdings}
              defaultType="income"
              trigger={
                <Button size="sm" className="gap-1.5">
                  <span>Lançar movimentação / provento</span>
                </Button>
              }
            />
          </div>
        ) : null}
      </div>

      {/* Gráfico de barras mensais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Evolução mensal de proventos recebidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasChartData ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              Nenhum provento nos últimos 12 meses
            </div>
          ) : (
          <div className="w-full">
            <ChartContainer data-sensitive-axis config={chartConfig} className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis
                    dataKey="label"
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(cents: number) => formatBRLCompact(cents)}
                  />
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0]?.payload as (typeof chartData)[number] | undefined;
                      if (!item) return null;
                      return (
                        <div className="rounded-lg border border-border/50 bg-background px-3 py-1.5 text-xs shadow-xl">
                          <div className="font-semibold">{String(label)}</div>
                          <div className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                            <Sensitive>{formatBRL(item.totalCents)}</Sensitive>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="totalCents"
                    fill="var(--color-total, #10B981)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela de histórico detalhado */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Extrato de proventos</CardTitle>
            <span className="text-xs text-muted-foreground">({overview.items.length})</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {overview.items.length === 0 ? (
            <div className="flex h-32 items-center justify-center p-4 text-sm text-muted-foreground">
              Nenhum provento registrado no período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[650px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[15%]">Data</TableHead>
                    <TableHead className="w-[30%]">Ativo</TableHead>
                    <TableHead className="w-[20%]">Corretora</TableHead>
                    <TableHead className="w-[20%]">Descrição</TableHead>
                    <TableHead className="w-[15%] text-right">Valor líquido</TableHead>
                    <TableHead className="w-[10%] text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs">
                        <DateBR date={item.date} />
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{item.assetName}</span>
                          {item.ticker ? (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {item.ticker}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: item.institutionColor }}
                          />
                          {item.institutionName}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.description ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="flex flex-col items-end">
                          <Money sensitive={false}
                            cents={item.netAmountCents}
                            className="font-semibold text-emerald-600 dark:text-emerald-400"
                          />
                          {item.taxCents > 0 ? (
                            <span className="text-[10px] text-muted-foreground">
                              Bruto: {formatBRL(item.amountCents)} (IR: {formatBRL(item.taxCents)})
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.source === 'manual' ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDelete(item.id, item.description)}
                            disabled={deletingId === item.id}
                            className="text-muted-foreground hover:text-destructive"
                            title="Excluir provento"
                            aria-label={`Excluir provento de ${item.assetName}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
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
