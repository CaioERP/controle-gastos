import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/format/money';
import { formatMonthBR } from '@/server/domain/dates';
import type { MonthlyCashFlowPoint } from '@/server/queries/cashflow';

type CashFlowBreakdownTableProps = {
  points: MonthlyCashFlowPoint[];
};

export function CashFlowBreakdownTable({ points }: CashFlowBreakdownTableProps) {
  if (points.length === 0) {
    return null;
  }

  // Totais do período consolidado
  const totalIncome = points.reduce((acc, p) => acc + p.projectedIncomeCents, 0);
  const totalFixed = points.reduce((acc, p) => acc + p.fixedExpensesCents, 0);
  const totalCard = points.reduce((acc, p) => acc + p.cardInstallmentsCents, 0);
  const totalVariable = points.reduce((acc, p) => acc + p.variableExpensesCents, 0);

  return (
    <Card className="border border-border/60 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Detalhamento mês a mês</CardTitle>
        <CardDescription className="text-xs">
          Composição detalhada do fluxo com receitas fixas, despesas recorrentes, faturas de cartão
          e estimativa de gastos variáveis.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-28">Mês</TableHead>
                <TableHead className="text-right">Saldo Inicial</TableHead>
                <TableHead className="text-right text-emerald-600 dark:text-emerald-400">
                  (+) Receitas
                </TableHead>
                <TableHead className="text-right">(-) Desp. Fixas</TableHead>
                <TableHead className="text-right">(-) Cartão / Parc.</TableHead>
                <TableHead className="text-right">(-) Variáveis (est.)</TableHead>
                <TableHead className="text-right font-semibold">(=) Saldo Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs sm:text-sm">
              {points.map((pt) => {
                const monthLabel = formatMonthBR(`${pt.month}-01`);
                const isNegative = pt.projectedBalanceCents < 0;

                return (
                  <TableRow
                    key={pt.month}
                    className={isNegative ? 'bg-destructive/5 hover:bg-destructive/10' : undefined}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{monthLabel}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {pt.month}
                        </span>
                        {isNegative && (
                          <Badge variant="destructive" className="h-4 px-1 text-[9px]">
                            déficit
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right text-muted-foreground">
                      <Money cents={pt.startingBalanceCents} />
                    </TableCell>

                    <TableCell className="text-right text-emerald-600 dark:text-emerald-400 font-medium">
                      <Money cents={pt.projectedIncomeCents} />
                    </TableCell>

                    <TableCell className="text-right text-muted-foreground">
                      <Money cents={pt.fixedExpensesCents} tone="flow" />
                    </TableCell>

                    <TableCell className="text-right text-muted-foreground">
                      <Money cents={pt.cardInstallmentsCents} tone="flow" />
                    </TableCell>

                    <TableCell className="text-right text-muted-foreground">
                      <Money cents={pt.variableExpensesCents} tone="flow" />
                    </TableCell>

                    <TableCell className="text-right font-semibold">
                      <Money
                        cents={pt.projectedBalanceCents}
                        colored
                        className={isNegative ? 'text-destructive font-bold' : ''}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="text-xs font-semibold">
                <TableCell>Total do período</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                  <Money cents={totalIncome} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  <Money cents={totalFixed} tone="flow" />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  <Money cents={totalCard} tone="flow" />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  <Money cents={totalVariable} tone="flow" />
                </TableCell>
                <TableCell className="text-right text-foreground">
                  <Money
                    cents={points[points.length - 1]?.projectedBalanceCents ?? 0}
                    colored
                  />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
