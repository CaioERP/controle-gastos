'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangleIcon, InfoIcon, KeyRoundIcon, UploadCloudIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  previewFileImportAction,
  previewPdfInvoiceImportAction,
} from '@/app/(app)/importar/actions';
import { ImportPreviewCard } from '@/components/imports/import-preview-card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AccountType } from '@/server/domain/enums';
import { ACCOUNT_TYPE_LABELS } from '@/server/domain/labels';
import type { ImportBatchPreview } from '@/server/commands/imports';

export type ImportAccountOption = {
  id: string;
  name: string;
  type: AccountType;
  institutionName: string;
  institutionColor: string;
  isSynchronized: boolean;
};

type ImportDropzoneProps = {
  accounts: ImportAccountOption[];
  defaultAccountId?: string;
  initialPreview?: ImportBatchPreview | null;
};

const MAX_BYTES = 5 * 1024 * 1024;

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function decodeBufferText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function ImportDropzone({
  accounts,
  defaultAccountId,
  initialPreview = null,
}: ImportDropzoneProps) {
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>(() => {
    if (defaultAccountId && accounts.some((a) => a.id === defaultAccountId)) {
      return defaultAccountId;
    }
    return accounts[0]?.id ?? '';
  });

  const [preview, setPreview] = React.useState<ImportBatchPreview | null>(initialPreview);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  // Estado para PDF protegido por senha (mantido apenas em memória)
  const [pendingPdf, setPendingPdf] = React.useState<{
    filename: string;
    pdfBase64: string;
  } | null>(null);
  const [pdfPassword, setPdfPassword] = React.useState('');
  const [selectedFileIsPdf, setSelectedFileIsPdf] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const currentAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];

  const handleFile = async (file: File) => {
    if (!currentAccount) {
      toast.error('Selecione uma conta de destino antes de enviar o arquivo.');
      return;
    }

    if (file.size > MAX_BYTES) {
      toast.error('O arquivo excede o tamanho máximo de 5 MB.');
      return;
    }

    const lower = file.name.toLowerCase();
    const isPdf = lower.endsWith('.pdf') || file.type === 'application/pdf';
    setSelectedFileIsPdf(isPdf);

    if (isPdf && currentAccount.type !== 'credit_card') {
      toast.error('Faturas em PDF só podem ser importadas em contas do tipo Cartão de crédito.');
      return;
    }

    const buffer = await file.arrayBuffer();

    if (isPdf) {
      const pdfBase64 = arrayBufferToBase64(buffer);
      startTransition(async () => {
        const res = await previewPdfInvoiceImportAction({
          accountId: currentAccount.id,
          filename: file.name,
          pdfBase64,
        });

        if (!res.ok) {
          if (
            res.error.code === 'PASSWORD_REQUIRED' ||
            res.error.code === 'INVALID_PASSWORD' ||
            /protegido por senha|senha do pdf/i.test(res.error.message)
          ) {
            setPendingPdf({ filename: file.name, pdfBase64 });
            setPdfPassword('');
            toast.warning(res.error.message);
            return;
          }
          toast.error(res.error.message);
          return;
        }

        setPendingPdf(null);
        setPdfPassword('');
        setPreview(res.data);
      });
      return;
    }

    const content = decodeBufferText(buffer);
    startTransition(async () => {
      const res = await previewFileImportAction({
        accountId: currentAccount.id,
        filename: file.name,
        content,
      });

      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }

      setPendingPdf(null);
      setPdfPassword('');
      setPreview(res.data);
    });
  };

  const handleUnlockPdf = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPdf || !currentAccount) return;
    if (!pdfPassword.trim()) {
      toast.error('Informe a senha do PDF.');
      return;
    }

    const passwordToSend = pdfPassword;
    startTransition(async () => {
      const res = await previewPdfInvoiceImportAction({
        accountId: currentAccount.id,
        filename: pendingPdf.filename,
        pdfBase64: pendingPdf.pdfBase64,
        password: passwordToSend,
      });

      // Limpa a senha do estado imediatamente após o envio
      setPdfPassword('');

      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }

      setPendingPdf(null);
      setPreview(res.data);
    });
  };

  if (preview) {
    const previewAccount =
      accounts.find((a) => a.id === preview.accountId) ?? currentAccount;
    const accountLabel = previewAccount
      ? `${previewAccount.name} (${previewAccount.institutionName})`
      : 'Conta selecionada';

    return (
      <ImportPreviewCard
        preview={preview}
        accountName={accountLabel}
        onDone={() => setPreview(null)}
      />
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center space-y-3">
        <p className="text-sm font-medium text-foreground">Nenhuma conta cadastrada</p>
        <p className="text-xs text-muted-foreground">
          Crie uma conta ou cartão em Contas e cartões antes de importar um arquivo.
        </p>
        <Link href="/contas" className={buttonVariants({ size: 'sm' })}>
          Ir para Contas e cartões
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6 shadow-2xs space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="import-account-select">Conta de destino</Label>
        <select
          id="import-account-select"
          className={selectClass}
          value={currentAccount?.id ?? ''}
          onChange={(e) => {
            setSelectedAccountId(e.target.value);
            setPendingPdf(null);
            setPdfPassword('');
          }}
          disabled={isPending}
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.institutionName} · {acc.name} ({ACCOUNT_TYPE_LABELS[acc.type]})
            </option>
          ))}
        </select>
      </div>

      {currentAccount?.isSynchronized && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-800 dark:text-blue-300">
          <InfoIcon className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Esta conta é sincronizada via Open Finance. Transações que já vieram pelo banco serão
            identificadas na pré-visualização para evitar duplicidade.
          </span>
        </div>
      )}

      {selectedFileIsPdf && currentAccount && currentAccount.type !== 'credit_card' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Faturas em PDF só podem ser importadas em contas do tipo Cartão de crédito.</span>
        </div>
      )}

      {/* Área de arrastar e soltar */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-foreground/30 bg-muted/10'
        }`}
      >
        <UploadCloudIcon className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {isPending
            ? 'Analisando arquivo...'
            : 'Arraste um arquivo OFX, CSV (Nubank) ou PDF de fatura aqui, ou clique para selecionar'}
        </p>
        <p className="text-xs text-muted-foreground">
          Formatos aceitos: .ofx, .csv, .pdf (máx. 5 MB)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ofx,.csv,.pdf"
          data-testid="import-file-input"
          className="sr-only"
          disabled={isPending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Campo de senha do PDF quando protegido */}
      {pendingPdf && (
        <form
          onSubmit={handleUnlockPdf}
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <KeyRoundIcon className="h-4 w-4 shrink-0" />
            <span>O arquivo &ldquo;{pendingPdf.filename}&rdquo; é protegido por senha</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="pdf-password-input">Senha do PDF</Label>
              <Input
                id="pdf-password-input"
                type="password"
                autoComplete="off"
                placeholder="Ex.: primeiros dígitos do CPF"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Desbloqueando...' : 'Desbloquear e analisar'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
