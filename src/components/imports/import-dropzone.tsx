'use client';

import * as React from 'react';
import Link from 'next/link';
import { InfoIcon, UploadCloudIcon } from 'lucide-react';
import { toast } from 'sonner';
import { previewFileImportAction } from '@/app/(app)/importar/actions';
import { ImportPreviewCard } from '@/components/imports/import-preview-card';
import { buttonVariants } from '@/components/ui/button';
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

const SEND_FAILED = {
  ok: false as const,
  error: { code: 'SEND_FAILED', message: 'Não foi possível enviar o arquivo. Tente um arquivo menor ou tente novamente.' },
};

/** Falha de transporte da Server Action (limite de corpo, rede) vira mensagem amigável em vez da tela de erro. */
async function safeSend<T>(call: () => Promise<T>): Promise<T | typeof SEND_FAILED> {
  try {
    return await call();
  } catch {
    return SEND_FAILED;
  }
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
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      toast.error('Importação de PDF ainda não disponível. Use OFX ou CSV.');
      return;
    }

    const buffer = await file.arrayBuffer();
    const content = decodeBufferText(buffer);
    startTransition(async () => {
      const res = await safeSend(() =>
        previewFileImportAction({
          accountId: currentAccount.id,
          filename: file.name,
          content,
        }),
      );

      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }

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
            : 'Arraste um arquivo OFX ou CSV (Nubank) aqui, ou clique para selecionar'}
        </p>
        <p className="text-xs text-muted-foreground">
          Formatos aceitos: .ofx, .csv (máx. 5 MB)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ofx,.csv"
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
    </div>
  );
}
