'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { accounts } from '@/server/db/schema';
import { CommandError, toCommandError } from '@/server/domain/errors';
import * as commands from '@/server/commands';
import {
  confirmFileImport,
  discardFileImport,
  previewFileImport,
  type ImportBatchPreview,
} from '@/server/commands/imports';
import { runAction, type ActionResult } from '@/lib/action';

export async function previewFileImportAction(input: {
  accountId: string;
  filename: string;
  content: string;
}) {
  const result = await runAction(() => previewFileImport(getDb(), input));
  if (result.ok) {
    revalidatePath('/importar');
  }
  return result;
}

const pdfPreviewInputSchema = z.object({
  accountId: z.string().uuid(),
  filename: z.string().trim().min(1),
  pdfBase64: z.string().min(1),
  password: z.string().nullable().optional(),
});

async function fallbackPreviewPdfInvoiceImport(
  input: z.infer<typeof pdfPreviewInputSchema>,
): Promise<ActionResult<ImportBatchPreview>> {
  try {
    const data = pdfPreviewInputSchema.parse(input);
    const db = getDb();
    const [account] = await db
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .where(eq(accounts.id, data.accountId));

    if (!account) {
      throw new CommandError('NOT_FOUND', 'Conta não encontrada');
    }
    if (account.type !== 'credit_card') {
      throw new CommandError(
        'VALIDATION',
        'Fatura em PDF só pode ser importada em uma conta de cartão de crédito',
      );
    }

    const bytes = Buffer.from(data.pdfBase64, 'base64');
    const header = bytes.subarray(0, 8).toString('latin1');
    if (!header.startsWith('%PDF-')) {
      throw new CommandError('VALIDATION', 'Arquivo PDF inválido.');
    }

    const rawText = bytes.toString('latin1');
    const isEncrypted = /\/Encrypt\b/.test(rawText);
    if (isEncrypted && (!data.password || data.password.trim() === '')) {
      return {
        ok: false,
        error: {
          code: 'PASSWORD_REQUIRED',
          message: 'Este PDF é protegido por senha. Informe a senha para continuar.',
        },
      };
    }

    throw new CommandError(
      'EXTERNAL',
      'A extração de faturas em PDF via IA requer a chave ANTHROPIC_API_KEY configurada (tarefa A2-02).',
    );
  } catch (err) {
    return runAction(async () => {
      throw toCommandError(err);
    });
  }
}

export async function previewPdfInvoiceImportAction(input: {
  accountId: string;
  filename: string;
  pdfBase64: string;
  password?: string | null;
}): Promise<ActionResult<ImportBatchPreview>> {
  const maybeCmd = (
    commands as unknown as {
      previewPdfInvoiceImport?: (
        db: ReturnType<typeof getDb>,
        arg: typeof input,
      ) => Promise<ImportBatchPreview>;
    }
  ).previewPdfInvoiceImport;

  const result =
    typeof maybeCmd === 'function'
      ? await runAction(() => maybeCmd(getDb(), input))
      : await fallbackPreviewPdfInvoiceImport(input);

  if (result.ok) {
    revalidatePath('/importar');
  }
  return result;
}

export async function confirmFileImportAction(
  input: Parameters<typeof confirmFileImport>[1],
) {
  const result = await runAction(() => confirmFileImport(getDb(), input));
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function discardFileImportAction(input: { batchId: string }) {
  const result = await runAction(() => discardFileImport(getDb(), input));
  if (result.ok) {
    revalidatePath('/importar');
  }
  return result;
}
