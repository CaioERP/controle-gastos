'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { createManualTransactionAction } from '@/app/(app)/transacoes/actions';
import { parseOptionalAmount } from '@/components/catalog/catalog-helpers';
import { CategoryIcon } from '@/components/transactions/category-badge';
import { CategoryPicker } from '@/components/transactions/category-picker';
import type { FlatCategory } from '@/components/transactions/tx-utils';
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
import { Textarea } from '@/components/ui/textarea';
import type { AccountType, PaymentMethod, TxKind } from '@/server/domain/enums';
import { PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { CategoryTree } from '@/server/queries/catalog';

export type ManualAccountOption = {
  id: string;
  name: string;
  type: AccountType;
  institutionName: string;
  institutionColor: string;
};

type ManualTransactionDialogProps = {
  accounts: ManualAccountOption[];
  categories: CategoryTree[];
  today: string;
};

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const MANUAL_PAYMENT_METHODS: PaymentMethod[] = [
  'cash',
  'pix',
  'debit_card',
  'ted_doc',
  'boleto',
  'direct_debit',
  'account_fee',
  'other',
];

export function ManualTransactionDialog({ accounts, categories, today }: ManualTransactionDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [date, setDate] = React.useState(today);
  const [accountId, setAccountId] = React.useState<string>(accounts[0]?.id ?? '');
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(() => {
    return accounts[0]?.type === 'wallet' ? 'cash' : 'pix';
  });
  const [selectedCat, setSelectedCat] = React.useState<FlatCategory | null>(null);
  const [notes, setNotes] = React.useState('');
  const [loading, startTransition] = React.useTransition();

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && !accountId && accounts.length > 0) {
      setAccountId(accounts[0]!.id);
      setPaymentMethod(accounts[0]!.type === 'wallet' ? 'cash' : 'pix');
    }
  };

  const handleAccountChange = (newAccId: string) => {
    setAccountId(newAccId);
    const acc = accounts.find((a) => a.id === newAccId);
    if (acc) {
      setPaymentMethod(acc.type === 'wallet' ? 'cash' : 'pix');
    }
  };

  const handleKindChange = (newKind: 'expense' | 'income') => {
    setKind(newKind);
    // Ao alternar entre despesa e receita, reseta a categoria selecionada para evitar incompatibilidade
    setSelectedCat(null);
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setDate(today);
    setSelectedCat(null);
    setNotes('');
    if (accounts.length > 0) {
      setAccountId(accounts[0]!.id);
      setPaymentMethod(accounts[0]!.type === 'wallet' ? 'cash' : 'pix');
    }
  };

  const save = async (keepOpen: boolean) => {
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      toast.error('Informe a descrição do lançamento');
      return;
    }

    const currentAccId = accountId || accounts[0]?.id;
    if (!currentAccId) {
      toast.error('Selecione uma conta manual');
      return;
    }

    const parsed = parseOptionalAmount(amount);
    if (parsed === undefined || parsed === null || parsed <= 0) {
      toast.error('Informe um valor válido maior que zero');
      return;
    }

    // Sinal R1: despesa negativa, receita positiva
    const amountCents = kind === 'expense' ? -parsed : parsed;

    startTransition(async () => {
      const res = await createManualTransactionAction({
        accountId: currentAccId,
        date,
        amountCents,
        description: trimmedDesc,
        kind: kind as TxKind,
        paymentMethod,
        categoryId: selectedCat?.id ?? null,
        notes: notes.trim() ? notes.trim() : null,
      });

      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }

      toast.success(kind === 'expense' ? 'Despesa lançada com sucesso' : 'Receita lançada com sucesso');

      if (keepOpen) {
        setAmount('');
        setDescription('');
      } else {
        resetForm();
        setOpen(false);
      }
    });
  };

  const hasManualAccounts = accounts.length > 0;
  const currentAccountId = accountId || accounts[0]?.id || '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="default" size="sm" className="gap-1.5">
            <Plus className="size-4" />
            <span className="hidden sm:inline">Novo lançamento</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lançamento manual</DialogTitle>
          <DialogDescription>
            Registre uma despesa ou receita em uma conta manual.
          </DialogDescription>
        </DialogHeader>

        {!hasManualAccounts ? (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
              <p className="font-medium">Nenhuma conta manual disponível</p>
              <p className="mt-1 text-xs">
                Para fazer lançamentos manuais, você precisa primeiro criar uma carteira ou conta manual.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose render={<Button type="button" variant="outline">Fechar</Button>} />
              <Button render={<Link href="/contas" />}>
                Ir para Contas e cartões
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
            className="space-y-4"
          >
            {/* Alternador Despesa / Receita */}
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => handleKindChange('expense')}
                className={`rounded-md py-1.5 transition-colors ${
                  kind === 'expense'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Despesa
              </button>
              <button
                type="button"
                onClick={() => handleKindChange('income')}
                className={`rounded-md py-1.5 transition-colors ${
                  kind === 'income'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Receita
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Valor */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-amount">Valor (R$) *</Label>
                <Input
                  id="tx-amount"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              {/* Data */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-date">Data *</Label>
                <Input
                  id="tx-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="tx-desc">Descrição *</Label>
              <Input
                id="tx-desc"
                placeholder="Ex.: Almoço no restaurante, Salário..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Conta */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-acc">Conta manual</Label>
                <select
                  id="tx-acc"
                  className={selectClass}
                  value={currentAccountId}
                  onChange={(e) => handleAccountChange(e.target.value)}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.institutionName})
                    </option>
                  ))}
                </select>
              </div>

              {/* Forma de Pagamento */}
              <div className="space-y-1.5">
                <Label htmlFor="tx-payment">Forma de pagamento</Label>
                <select
                  id="tx-payment"
                  className={selectClass}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Categoria */}
            <div className="space-y-1.5">
              <Label>Categoria (opcional)</Label>
              <div className="flex items-center gap-2">
                <CategoryPicker
                  categories={categories}
                  kind={kind}
                  value={selectedCat?.id ?? null}
                  onSelect={(cat) => setSelectedCat(cat)}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      {selectedCat ? (
                        <span className="flex items-center gap-2 truncate">
                          <CategoryIcon
                            name={selectedCat.icon}
                            className="size-4 shrink-0"
                            style={{ color: selectedCat.color }}
                          />
                          <span className="truncate">{selectedCat.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Selecionar categoria...</span>
                      )}
                    </Button>
                  }
                />
                {selectedCat && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedCat(null)}
                    title="Remover categoria"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="tx-notes">Observações</Label>
              <Textarea
                id="tx-notes"
                placeholder="Anotações opcionais..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={2}
              />
            </div>

            <DialogFooter className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <DialogClose
                render={
                  <Button type="button" variant="outline" disabled={loading}>
                    Cancelar
                  </Button>
                }
              />
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() => void save(true)}
              >
                Salvar e lançar outro
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}