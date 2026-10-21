'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pencil, Plus } from 'lucide-react';
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
import { Money } from '@/components/format/money';
import { DateBR } from '@/components/format/date-br';
import { formatQtyBR } from '@/server/investments/math';
import { type AssetClass } from '@/server/domain/enums';
import { ASSET_CLASS_LABELS, INVESTMENT_INDEXER_LABELS } from '@/server/domain/labels';
import { ManualHoldingDialog } from './manual-holding-dialog';
import { InvestmentTxDialog } from './investment-tx-dialog';
import type { HoldingRow } from '@/server/queries/investments';

type HoldingsTableProps = {
  holdings: HoldingRow[];
  institutions: Array<{ id: string; name: string; color: string }>;
  investmentAccounts?: Array<{ id: string; name: string; institutionName: string }>;
};

export function HoldingsTable({
  holdings,
  institutions,
  investmentAccounts = [],
}: HoldingsTableProps) {
  const [selectedInstId, setSelectedInstId] = React.useState<string>('all');
  const [selectedClass, setSelectedClass] = React.useState<string>('all');

  const holdingsForTx = React.useMemo(() => {
    return holdings.map((h) => ({
      id: h.id,
      assetName: h.assetName,
      ticker: h.ticker,
      institutionName: h.institutionName,
    }));
  }, [holdings]);

  // Filtra dinamicamente no cliente para resposta instantânea
  const filtered = React.useMemo(() => {
    return holdings.filter((h) => {
      if (selectedInstId !== 'all' && h.institutionId !== selectedInstId) {
        return false;
      }
      if (selectedClass !== 'all' && h.assetClass !== selectedClass) {
        return false;
      }
      return true;
    });
  }, [holdings, selectedInstId, selectedClass]);

  // Classes presentes nas posições
  const presentClasses = React.useMemo(() => {
    const set = new Set<AssetClass>();
    for (const h of holdings) {
      set.add(h.assetClass);
    }
    return Array.from(set);
  }, [holdings]);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-semibold">Posições ativas</CardTitle>
          <span className="text-xs text-muted-foreground">({filtered.length})</span>
        </div>

        {/* Filtros rápidos e botões de ação */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Instituição */}
          <select
            value={selectedInstId}
            onChange={(e) => setSelectedInstId(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filtrar por instituição"
          >
            <option value="all">Todas as corretoras</option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>

          {/* Seletor de Classe de ativo */}
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filtrar por classe de ativo"
          >
            <option value="all">Todas as classes</option>
            {presentClasses.map((cls) => (
              <option key={cls} value={cls}>
                {ASSET_CLASS_LABELS[cls] ?? cls}
              </option>
            ))}
          </select>

          {/* Botão Nova posição manual */}
          <ManualHoldingDialog accounts={investmentAccounts} />

          {/* Botão Lançar movimentação */}
          {holdingsForTx.length > 0 ? (
            <InvestmentTxDialog
              holdings={holdingsForTx}
              trigger={
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="size-4" />
                  <span>Movimentação / Provento</span>
                </Button>
              }
            />
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="flex h-36 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            Nenhum investimento encontrado com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[34%]">Ativo</TableHead>
                  <TableHead className="w-[12%]">Classe</TableHead>
                  <TableHead className="w-[11%] text-right">Quantidade</TableHead>
                  <TableHead className="w-[11%] text-right">Aplicado</TableHead>
                  <TableHead className="w-[11%] text-right">Posição atual</TableHead>
                  <TableHead className="w-[11%] text-right">Resultado</TableHead>
                  <TableHead className="w-[10%] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const profitSign = row.profitBps >= 0 ? '+' : '';
                  const profitPercent = `${profitSign}${(row.profitBps / 100).toFixed(2).replace('.', ',')}%`;

                  // Rótulo de taxa / indexador
                  let rateInfo = '';
                  if (row.rateBps && row.indexer) {
                    const rateFormatted = (row.rateBps / 100).toFixed(2).replace('.', ',');
                    if (row.indexer === 'cdi') {
                      rateInfo = `${rateFormatted}% do CDI`;
                    } else if (row.indexer === 'ipca') {
                      rateInfo = `IPCA + ${rateFormatted}%`;
                    } else if (row.indexer === 'selic') {
                      rateInfo = `${rateFormatted}% da Selic`;
                    } else if (row.indexer === 'prefixado') {
                      rateInfo = `${rateFormatted}% a.a.`;
                    } else {
                      rateInfo = `${INVESTMENT_INDEXER_LABELS[row.indexer]} ${rateFormatted}%`;
                    }
                  } else if (row.indexer) {
                    rateInfo = INVESTMENT_INDEXER_LABELS[row.indexer];
                  }

                  return (
                    <TableRow key={row.id}>
                      {/* Ativo */}
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/investimentos/${row.id}`}
                              className="font-medium text-foreground hover:underline"
                            >
                              {row.assetName}
                            </Link>
                            {row.ticker ? (
                              <Badge variant="outline" className="text-[11px] font-mono">
                                {row.ticker}
                              </Badge>
                            ) : null}
                            {row.isTaxExempt ? (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-50 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              >
                                Isento IR
                              </Badge>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: row.institutionColor }}
                              />
                              {row.institutionName}
                            </span>
                            {rateInfo ? <span>· {rateInfo}</span> : null}
                            {row.maturityDate ? (
                              <span>
                                · Venc. <DateBR date={row.maturityDate} />
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      {/* Classe */}
                      <TableCell className="align-top text-xs text-muted-foreground">
                        {ASSET_CLASS_LABELS[row.assetClass] ?? row.assetClass}
                      </TableCell>

                      {/* Quantidade */}
                      <TableCell className="align-top text-right text-xs font-mono">
                        {formatQtyBR(row.quantity)}
                      </TableCell>

                      {/* Valor aplicado */}
                      <TableCell className="align-top text-right text-xs text-muted-foreground">
                        <Money cents={row.investedCents} />
                      </TableCell>

                      {/* Posição atual */}
                      <TableCell className="align-top text-right text-xs font-semibold">
                        <Money cents={row.currentValueCents} />
                      </TableCell>

                      {/* Resultado */}
                      <TableCell className="align-top text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Money cents={row.profitCents} signed colored className="text-xs" />
                          <Badge
                            variant={row.profitBps >= 0 ? 'default' : 'destructive'}
                            className="px-1.5 py-0 text-[10px] tabular-nums"
                          >
                            {profitPercent}
                          </Badge>
                        </div>
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="align-top text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Manual: edita tudo e exclui. Pluggy: só ajusta quantidade/valores (R9). */}
                          <ManualHoldingDialog
                            holding={row}
                            accounts={investmentAccounts}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="text-muted-foreground hover:text-foreground"
                                title={row.source === 'manual' ? 'Editar posição' : 'Ajustar valores da posição'}
                                aria-label={`${row.source === 'manual' ? 'Editar posição' : 'Ajustar valores da posição'} ${row.assetName}`}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            }
                          />

                          <InvestmentTxDialog
                            holdings={holdingsForTx}
                            defaultHoldingId={row.id}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="text-muted-foreground hover:text-foreground"
                                title="Lançar movimentação ou provento"
                                aria-label={`Lançar movimentação ou provento em ${row.assetName}`}
                              >
                                <Plus className="size-3.5" />
                              </Button>
                            }
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
