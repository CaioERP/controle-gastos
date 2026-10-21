'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toCents } from '@/server/domain/money';
import { toRateBps } from '@/server/investments/math';
import {
  ASSET_CLASSES,
  INVESTMENT_INDEXERS,
  type AssetClass,
  type InvestmentIndexer,
} from '@/server/domain/enums';
import { ASSET_CLASS_LABELS, INVESTMENT_INDEXER_LABELS } from '@/server/domain/labels';
import {
  deleteManualHoldingAction,
  upsertManualHoldingAction,
} from '@/app/(app)/investimentos/actions';
import type { HoldingRow } from '@/server/queries/investments';
import { centsToInput, parseQuantityInput, quantityToInput } from './input-format';

type ManualHoldingDialogProps = {
  holding?: HoldingRow;
  accounts: Array<{ id: string; name: string; institutionName: string }>;
  trigger?: React.ReactNode;
};

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';

export function ManualHoldingDialog({ holding, accounts, trigger }: ManualHoldingDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, startTransition] = React.useTransition();
  const [deleting, startDeleteTransition] = React.useTransition();

  const isEditing = Boolean(holding);
  // Posição sincronizada (Pluggy): só quantidade e valores podem ser ajustados (R9); o resto vem da sincronização.
  const isSynced = Boolean(holding && holding.source !== 'manual');

  // Form states
  const [accountId, setAccountId] = React.useState(holding?.accountId ?? accounts[0]?.id ?? '');
  const [assetClass, setAssetClass] = React.useState<AssetClass>(
    holding?.assetClass ?? 'fixed_income',
  );
  const [name, setName] = React.useState(holding?.assetName ?? '');
  const [ticker, setTicker] = React.useState(holding?.ticker ?? '');
  const [indexer, setIndexer] = React.useState<InvestmentIndexer | ''>(holding?.indexer ?? 'cdi');
  const [rate, setRate] = React.useState(
    holding?.rateBps ? (holding.rateBps / 100).toString().replace('.', ',') : '',
  );
  const [maturityDate, setMaturityDate] = React.useState(holding?.maturityDate ?? '');
  const [isTaxExempt, setIsTaxExempt] = React.useState(holding?.isTaxExempt ?? false);
  const [quantity, setQuantity] = React.useState(
    holding ? quantityToInput(holding.quantity) : '1',
  );
  const [invested, setInvested] = React.useState(
    holding ? centsToInput(holding.investedCents) : '',
  );
  const [currentValue, setCurrentValue] = React.useState(
    holding ? centsToInput(holding.currentValueCents) : '',
  );

  const initForm = React.useCallback(() => {
    setAccountId(holding?.accountId ?? accounts[0]?.id ?? '');
    setAssetClass(holding?.assetClass ?? 'fixed_income');
    setName(holding?.assetName ?? '');
    setTicker(holding?.ticker ?? '');
    setIndexer(holding?.indexer ?? 'cdi');
    setRate(holding?.rateBps ? (holding.rateBps / 100).toString().replace('.', ',') : '');
    setMaturityDate(holding?.maturityDate ?? '');
    setIsTaxExempt(holding?.isTaxExempt ?? false);
    setQuantity(holding ? quantityToInput(holding.quantity) : '1');
    setInvested(holding ? centsToInput(holding.investedCents) : '');
    setCurrentValue(holding ? centsToInput(holding.currentValueCents) : '');
  }, [holding, accounts]);

  const showFixedIncomeFields = assetClass === 'fixed_income' || assetClass === 'treasury';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Informe o nome do ativo');
      return;
    }
    if (!accountId) {
      toast.error('Selecione a conta de investimento');
      return;
    }

    const qty = parseQuantityInput(quantity);
    if (!qty.ok) {
      toast.error(qty.message);
      return;
    }

    let investedCents: number;
    let currentValueCents: number;
    try {
      investedCents = toCents(invested || '0');
      currentValueCents = toCents(currentValue || invested || '0');
    } catch {
      toast.error('Valor monetário inválido');
      return;
    }

    const rateText = rate.trim().replace(/%$/, '');
    if (showFixedIncomeFields && !isSynced && rateText && !/^\d+([.,]\d+)?$/.test(rateText)) {
      toast.error('Taxa contratada inválida');
      return;
    }
    const rateBps = rateText ? toRateBps(rateText) : null;

    startTransition(async () => {
      const res = await upsertManualHoldingAction({
        holdingId: holding?.id,
        accountId,
        assetClass,
        name: trimmedName,
        ticker: ticker.trim() ? ticker.trim().toUpperCase() : null,
        indexer: showFixedIncomeFields && indexer ? indexer : null,
        rateBps: showFixedIncomeFields ? rateBps : null,
        maturityDate: showFixedIncomeFields && maturityDate ? maturityDate : null,
        isTaxExempt: showFixedIncomeFields ? isTaxExempt : false,
        quantity: qty.value,
        investedCents,
        currentValueCents,
      });

      if (res.ok) {
        toast.success(
          isEditing ? 'Posição atualizada com sucesso' : 'Posição cadastrada com sucesso',
        );
        setOpen(false);
      } else {
        toast.error(res.error.message || 'Erro ao salvar posição');
      }
    });
  };

  const handleDelete = () => {
    if (!holding) return;
    if (!confirm(`Deseja realmente excluir a posição "${holding.assetName}"?`)) {
      return;
    }

    startDeleteTransition(async () => {
      const res = await deleteManualHoldingAction({ holdingId: holding.id });
      if (res.ok) {
        toast.success('Posição excluída com sucesso');
        setOpen(false);
      } else {
        toast.error(res.error.message || 'Erro ao excluir posição');
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) initForm();
      }}
    >
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" />
              <span>Nova posição manual</span>
            </Button>
          )
        }
      />

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Editar posição' : 'Nova posição manual de investimento'}
            </DialogTitle>
            <DialogDescription>
              {isSynced
                ? 'Posição sincronizada pelo Open Finance: ajuste quantidade e valores. O ajuste é preservado nas próximas sincronizações.'
                : isEditing
                  ? 'Atualize os dados e valores da sua posição de investimento.'
                  : 'Cadastre ativos de renda fixa, ações, FIIs ou cripto não sincronizados automaticamente.'}
            </DialogDescription>
          </DialogHeader>

          {accounts.length === 0 ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              Nenhuma conta encontrada. Crie primeiro uma conta de investimento na aba{' '}
              <Link href="/contas" className="underline font-semibold">
                Contas e cartões
              </Link>
              .
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Conta */}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="account">Conta de investimento</Label>
              <select
                id="account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={selectClass}
                disabled={isSynced}
                required
              >
                {isSynced && holding && !accounts.some((acc) => acc.id === holding.accountId) ? (
                  <option value={holding.accountId}>
                    {holding.institutionName} — {holding.accountName}
                  </option>
                ) : null}
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.institutionName} — {acc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Classe do ativo */}
            <div className="space-y-1">
              <Label htmlFor="assetClass">Classe do ativo</Label>
              <select
                id="assetClass"
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value as AssetClass)}
                className={selectClass}
                disabled={isSynced}
                required
              >
                {ASSET_CLASSES.map((cls) => (
                  <option key={cls} value={cls}>
                    {ASSET_CLASS_LABELS[cls]}
                  </option>
                ))}
              </select>
            </div>

            {/* Ticker / Código */}
            <div className="space-y-1">
              <Label htmlFor="ticker">
                Ticker / Código <span className="text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Ex.: PETR4, HGLG11, BTC"
                disabled={isSynced}
              />
            </div>

            {/* Nome do ativo */}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="name">Nome do ativo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: CDB Banco Inter 110% CDI ou Tesouro Selic 2029"
                disabled={isSynced}
                required
              />
              {isSynced ? null : (
                <p className="text-[11px] text-muted-foreground">
                  Dica: preencha o ticker acima para permitir a atualização automática de cotações.
                </p>
              )}
            </div>

            {/* Campos de Renda Fixa e Tesouro */}
            {showFixedIncomeFields ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="indexer">Indexador</Label>
                  <select
                    id="indexer"
                    value={indexer}
                    onChange={(e) => setIndexer(e.target.value as InvestmentIndexer)}
                    className={selectClass}
                    disabled={isSynced}
                  >
                    {INVESTMENT_INDEXERS.map((idx) => (
                      <option key={idx} value={idx}>
                        {INVESTMENT_INDEXER_LABELS[idx]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="rate">Taxa contratada (%)</Label>
                  <Input
                    id="rate"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="Ex.: 110 (para 110% CDI) ou 6,25 (IPCA + 6,25%)"
                    disabled={isSynced}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="maturityDate">Data de vencimento</Label>
                  <Input
                    id="maturityDate"
                    type="date"
                    value={maturityDate}
                    onChange={(e) => setMaturityDate(e.target.value)}
                    disabled={isSynced}
                  />
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <Checkbox
                    id="isTaxExempt"
                    checked={isTaxExempt}
                    onCheckedChange={(checked) => setIsTaxExempt(Boolean(checked))}
                    disabled={isSynced}
                  />
                  <Label htmlFor="isTaxExempt" className="text-xs font-normal cursor-pointer">
                    Isento de Imposto de Renda (LCI, LCA, CRI, CRA)
                  </Label>
                </div>
              </>
            ) : null}

            {/* Quantidade */}
            <div className="space-y-1">
              <Label htmlFor="quantity">Quantidade</Label>
              <Input
                id="quantity"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ex.: 100 ou 0,015"
                inputMode="decimal"
                required
              />
            </div>

            {/* Valor aplicado */}
            <div className="space-y-1">
              <Label htmlFor="invested">Valor aplicado (R$)</Label>
              <Input
                id="invested"
                value={invested}
                onChange={(e) => setInvested(e.target.value)}
                placeholder="Ex.: 1.000,00"
                inputMode="decimal"
                required
              />
            </div>

            {/* Valor bruto atual */}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="currentValue">Valor bruto atual (R$)</Label>
              <Input
                id="currentValue"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                placeholder="Ex.: 1.050,00"
                inputMode="decimal"
                required
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
            {isEditing && holding?.source === 'manual' ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={loading || deleting}
                className="gap-1.5 sm:mr-auto"
              >
                <Trash2 className="size-4" />
                <span>{deleting ? 'Excluindo...' : 'Excluir'}</span>
              </Button>
            ) : <span />}

            <div className="flex items-center gap-2">
              <DialogClose
                render={
                  <Button type="button" variant="outline" size="sm" disabled={loading || deleting}>
                    Cancelar
                  </Button>
                }
              />
              <Button type="submit" size="sm" disabled={loading || deleting}>
                {loading ? 'Salvando...' : 'Salvar posição'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
