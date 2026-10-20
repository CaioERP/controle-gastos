'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
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
import { today } from '@/server/domain/dates';
import { toCents } from '@/server/domain/money';
import { INVESTMENT_TX_TYPES, type InvestmentTxType } from '@/server/domain/enums';
import { INVESTMENT_TX_TYPE_LABELS } from '@/server/domain/labels';
import { recordInvestmentTransactionAction } from '@/app/(app)/investimentos/actions';

type InvestmentTxDialogProps = {
  holdings: Array<{ id: string; assetName: string; ticker: string | null; institutionName: string }>;
  defaultHoldingId?: string;
  defaultType?: InvestmentTxType;
  trigger?: React.ReactNode;
};

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export function InvestmentTxDialog({
  holdings,
  defaultHoldingId,
  defaultType = 'income',
  trigger,
}: InvestmentTxDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, startTransition] = React.useTransition();

  const [holdingId, setHoldingId] = React.useState(defaultHoldingId ?? holdings[0]?.id ?? '');
  const [type, setType] = React.useState<InvestmentTxType>(defaultType);
  const [date, setDate] = React.useState(today());
  const [amount, setAmount] = React.useState('');
  const [tax, setTax] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [unitPrice, setUnitPrice] = React.useState('');
  const [description, setDescription] = React.useState('');

  const initForm = React.useCallback(() => {
    setHoldingId(defaultHoldingId ?? holdings[0]?.id ?? '');
    setType(defaultType);
    setDate(today());
    setAmount('');
    setTax('');
    setQuantity('');
    setUnitPrice('');
    setDescription(defaultType === 'income' ? 'Dividendo / Rendimento' : '');
  }, [defaultHoldingId, holdings, defaultType]);

  const showTradeFields = type === 'buy' || type === 'sell';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holdingId) {
      toast.error('Selecione o ativo de investimento');
      return;
    }

    let amountCents: number;
    let taxCents = 0;
    let unitPriceCents: number | null = null;

    try {
      amountCents = toCents(amount);
      if (tax.trim()) {
        taxCents = toCents(tax);
      }
      if (unitPrice.trim()) {
        unitPriceCents = toCents(unitPrice);
      }
    } catch {
      toast.error('Valor monetário inválido');
      return;
    }

    if (amountCents <= 0) {
      toast.error('O valor deve ser maior que zero');
      return;
    }

    startTransition(async () => {
      const res = await recordInvestmentTransactionAction({
        holdingId,
        type,
        date,
        amountCents,
        taxCents,
        quantity: showTradeFields && quantity.trim() ? quantity.trim() : null,
        unitPriceCents: showTradeFields ? unitPriceCents : null,
        description: description.trim() || null,
      });

      if (res.ok) {
        toast.success(
          type === 'income'
            ? 'Provento registrado com sucesso'
            : 'Movimentação registrada com sucesso',
        );
        setOpen(false);
      } else {
        toast.error(res.error.message || 'Erro ao registrar movimentação');
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
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="size-4" />
              <span>
                {defaultType === 'income' ? 'Registrar provento' : 'Lançar movimentação'}
              </span>
            </Button>
          )
        }
      />

      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {type === 'income' ? 'Registrar provento / rendimento' : 'Lançar movimentação'}
            </DialogTitle>
            <DialogDescription>
              {type === 'income'
                ? 'Lance dividendos, JCP ou rendimentos de FIIs creditados na conta.'
                : 'Registre compras adicionais, resgates parciais ou totais de ativos.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Posição / Ativo */}
            <div className="space-y-1">
              <Label htmlFor="holding">Ativo / Posição</Label>
              <select
                id="holding"
                value={holdingId}
                onChange={(e) => setHoldingId(e.target.value)}
                className={selectClass}
                required
              >
                {holdings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.assetName} {h.ticker ? `(${h.ticker})` : ''} — {h.institutionName}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de Operação */}
            <div className="space-y-1">
              <Label htmlFor="type">Tipo de operação</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as InvestmentTxType)}
                className={selectClass}
                required
              >
                {INVESTMENT_TX_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INVESTMENT_TX_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Data */}
            <div className="space-y-1">
              <Label htmlFor="date">Data da operação</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Valor bruto e Imposto retido */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="amount">Valor bruto (R$)</Label>
                <Input
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Ex.: 120,50"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tax">Imposto retido (R$)</Label>
                <Input
                  id="tax"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="Ex.: 15,00"
                />
              </div>
            </div>

            {/* Campos de compra / venda */}
            {showTradeFields ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="qty">Quantidade</Label>
                  <Input
                    id="qty"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Ex.: 10"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="unitPrice">Preço unitário (R$)</Label>
                  <Input
                    id="unitPrice"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="Ex.: 41,20"
                  />
                </div>
              </div>
            ) : null}

            {/* Descrição */}
            <div className="space-y-1">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Dividendo mensal, Rendimento FII, JCP"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <DialogClose
              render={
                <Button type="button" variant="outline" size="sm" disabled={loading}>
                  Cancelar
                </Button>
              }
            />
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
