'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ScissorsIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Money } from '@/components/format/money';
import { DateBR } from '@/components/format/date-br';
import { formatTimeBR } from '@/components/format/time-br';
import { formatAmountInput, parseOptionalAmount } from '@/components/catalog/catalog-helpers';
import { PAYMENT_METHODS, TX_KINDS, type PaymentMethod, type TxKind } from '@/server/domain/enums';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { CategoryTree, TagWithCount } from '@/server/queries/catalog';
import type { TransactionRow as Tx, TransactionTag } from '@/server/queries/transaction-row';
import {
  deleteManualTransactionAction,
  loadTransactionDetailAction,
  updateManualTransactionAction,
  updateTransactionAction,
  upsertTagAction,
} from '@/app/(app)/transacoes/actions';
import { TagPicker, nextTagColor } from './tag-picker';
import { TransactionDetailInfo } from './transaction-detail-info';
import { SplitDialog } from './split-dialog';
import { buildEditPatch } from './tx-utils';

type TransactionSheetProps = {
  tx: Tx | null;
  categories?: CategoryTree[];
  tags: TagWithCount[];
  onClose: () => void;
  onSaved: (id: string, changes: Partial<Tx>) => void;
};

export function TransactionSheet({ tx, categories = [], tags, onClose, onSaved }: TransactionSheetProps) {
  return (
    <Sheet open={tx !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {tx && <SheetBody key={tx.id} tx={tx} categories={categories} tags={tags} onClose={onClose} onSaved={onSaved} />}
      </SheetContent>
    </Sheet>
  );
}

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function SheetBody({
  tx,
  categories,
  tags,
  onClose,
  onSaved,
}: Omit<TransactionSheetProps, 'tx'> & { tx: Tx; categories: CategoryTree[] }) {
  const [description, setDescription] = React.useState(tx.description);
  const [kind, setKind] = React.useState<TxKind>(tx.kind);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(tx.paymentMethod);
  const [notes, setNotes] = React.useState(tx.notes ?? '');
  const [date, setDate] = React.useState(tx.date);
  const [amount, setAmount] = React.useState(formatAmountInput(Math.abs(tx.amountCents)));
  const [tagIds, setTagIds] = React.useState(tx.tags.map((t) => t.id));
  const [allTags, setAllTags] = React.useState<TransactionTag[]>(() => {
    const byId = new Map<string, TransactionTag>();
    for (const t of [...tags, ...tx.tags]) byId.set(t.id, { id: t.id, name: t.name, color: t.color });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });
  const [isManual, setIsManual] = React.useState(false);
  const [hasSplitParts, setHasSplitParts] = React.useState(false);
  const [saving, startSave] = React.useTransition();
  const [splitOpen, setSplitOpen] = React.useState(false);

  const canSplit =
    (tx.kind === 'expense' || tx.kind === 'income') &&
    tx.status !== 'projected' &&
    !tx.parentTransactionId &&
    !hasSplitParts;

  React.useEffect(() => {
    let active = true;
    loadTransactionDetailAction(tx.id).then((res) => {
      if (!active) return;
      if (res.ok) {
        const splitActive = res.data.splitParts.length > 0;
        setHasSplitParts(splitActive);
        const manual =
          !tx.parentTransactionId && !splitActive && res.data.detail.sources.some((s) => s.source === 'manual');
        setIsManual(manual);
      }
    });
    return () => {
      active = false;
    };
  }, [tx.id, tx.parentTransactionId]);

  const createTag = async (name: string): Promise<TransactionTag | null> => {
    const color = nextTagColor(allTags.length);
    const res = await upsertTagAction({ name, color });
    if (!res.ok) {
      toast.error(res.error.message);
      return null;
    }
    const tag = { id: res.data.id, name, color };
    setAllTags((prev) => [...prev.filter((t) => t.id !== tag.id), tag]);
    toast.success(`Tag “${name}” criada`);
    return tag;
  };

  const handleDelete = () => {
    if (!window.confirm('Tem certeza que deseja excluir este lançamento manual? O saldo da conta será recalculado.')) {
      return;
    }
    startSave(async () => {
      const res = await deleteManualTransactionAction({ transactionId: tx.id });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success('Lançamento manual excluído');
      onClose();
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = description.trim();
    if (!trimmed) {
      toast.error('A descrição não pode ficar vazia');
      return;
    }

    let manualTargetCents = tx.amountCents;
    let manualDateChanged = false;
    let manualAmountChanged = false;

    if (isManual) {
      const parsed = parseOptionalAmount(amount);
      if (parsed === undefined || parsed === null || parsed <= 0) {
        toast.error('Informe um valor válido maior que zero');
        return;
      }
      manualTargetCents = kind === 'expense' ? -parsed : parsed;
      manualDateChanged = date !== tx.date;
      manualAmountChanged = manualTargetCents !== tx.amountCents;
    }

    const patch = buildEditPatch(tx, { description, kind, paymentMethod, notes, tagIds });

    if (Object.keys(patch).length === 0 && !manualDateChanged && !manualAmountChanged) {
      onClose();
      return;
    }

    startSave(async () => {
      if (isManual && (manualDateChanged || manualAmountChanged)) {
        const manualRes = await updateManualTransactionAction({
          transactionId: tx.id,
          patch: {
            date: manualDateChanged ? date : undefined,
            amountCents: manualAmountChanged ? manualTargetCents : undefined,
          },
        });
        if (!manualRes.ok) {
          toast.error(manualRes.error.message);
          return;
        }
      }

      if (Object.keys(patch).length > 0) {
        const res = await updateTransactionAction({ transactionId: tx.id, patch });
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
      }

      const changes: Partial<Tx> = {};
      if (patch.description !== undefined) changes.description = patch.description;
      if (patch.kind !== undefined) changes.kind = patch.kind;
      if (patch.paymentMethod !== undefined) changes.paymentMethod = patch.paymentMethod;
      if (patch.notes !== undefined) changes.notes = patch.notes;
      if (patch.tagIds !== undefined) changes.tags = allTags.filter((t) => tagIds.includes(t.id));
      if (manualDateChanged) changes.date = date;
      if (manualAmountChanged) changes.amountCents = manualTargetCents;

      onSaved(tx.id, changes);
      toast.success('Transação atualizada');
      onClose();
    });
  };

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="truncate">{tx.description}</SheetTitle>
        <SheetDescription className="flex items-center gap-2">
          <DateBR date={tx.date} />
          {tx.occurredAt && <span className="tabular-nums">às {formatTimeBR(tx.occurredAt)}</span>}
          <span aria-hidden="true">·</span>
          <Money sensitive={false} cents={tx.amountCents} />
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pt-4">
        {/* Campos editáveis exclusivos de transações manuais: Data e Valor */}
        {isManual && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Data</Label>
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">Valor (R$)</Label>
              <Input
                id="tx-amount"
                value={amount}
                placeholder="0,00"
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="tx-description">Descrição</Label>
          <Input
            id="tx-description"
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tx-kind">Natureza</Label>
            <select id="tx-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as TxKind)}>
              {TX_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-payment">Forma de pagamento</Label>
            <select
              id="tx-payment"
              className={selectClass}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tx-notes">Observações</Label>
          <Textarea
            id="tx-notes"
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anotações sobre esta transação"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Tags</span>
          <TagPicker tags={allTags} selectedIds={tagIds} onChange={setTagIds} onCreate={createTag} />
        </div>

        {canSplit && (
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSplitOpen(true)}
              className="w-full gap-1.5 text-xs"
            >
              <ScissorsIcon className="size-3.5" />
              Dividir transação
            </Button>
          </div>
        )}
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          {isManual
            ? 'Lançamento manual: alterações de data e valor atualizam o saldo da conta.'
            : 'Campos que você editar não serão sobrescritos pela sincronização.'}
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>

        {/* Botão de Excluir exclusivo de transações manuais */}
        {isManual && (
          <div className="pt-2 border-t">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full gap-1.5"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 className="size-4" />
              <span>Excluir transação manual</span>
            </Button>
          </div>
        )}
      </form>

      <TransactionDetailInfo tx={tx} onReload={onClose} />

      {canSplit && (
        <SplitDialog
          key={`${tx.id}-${splitOpen}`}
          tx={tx}
          categories={categories}
          open={splitOpen}
          onOpenChange={setSplitOpen}
          onSuccess={onClose}
        />
      )}
    </>
  );
}