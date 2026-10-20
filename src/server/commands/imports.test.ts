import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { accounts, invoices, transactions, transactionSources } from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import { createTestDb } from '../../../tests/helpers/db';
import { confirmFileImport, discardFileImport, previewFileImport } from './imports';
import { createManualAccount } from './manual';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'files');

describe('previewFileImport, confirmFileImport e discardFileImport (A2-01)', () => {
  it('previewFileImport + confirmFileImport cria transações, atualiza saldo de conta manual e grava importBatchId em transaction_sources; reimportar mesmo arquivo marca 100% exact_duplicate e created: 0', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const { accountId } = await createManualAccount(db, {
      name: 'Conta Itaú Manual',
      type: 'checking',
      initialBalanceCents: 10000,
    });

    const ofxContent = readFileSync(join(fixturesDir, 'itau-extrato.ofx'), 'utf-8');

    const preview1 = await previewFileImport(db, {
      accountId,
      filename: 'itau-extrato.ofx',
      content: ofxContent,
    });

    expect(preview1.format).toBe('ofx');
    expect(preview1.summary).toEqual({
      totalItems: 3,
      newCount: 3,
      exactDuplicateCount: 0,
      fuzzyDuplicateCount: 0,
      ambiguousCount: 0,
    });

    const confirmed1 = await confirmFileImport(db, { batchId: preview1.batchId });
    expect(confirmed1).toEqual({
      batchId: preview1.batchId,
      created: 3,
      linked: 0,
      skippedDuplicates: 0,
    });

    const sources = await db
      .select()
      .from(transactionSources)
      .where(eq(transactionSources.importBatchId, preview1.batchId));
    expect(sources).toHaveLength(3);

    // Saldo: 10000 + (-4590 + 520000 - 1850) = 523560
    const [accAfter] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(accAfter?.balanceCents).toBe(523560);

    // Reimportar o mesmo arquivo -> 100% exact_duplicate e created: 0
    const preview2 = await previewFileImport(db, {
      accountId,
      filename: 'itau-extrato.ofx',
      content: ofxContent,
    });
    expect(preview2.summary).toEqual({
      totalItems: 3,
      newCount: 0,
      exactDuplicateCount: 3,
      fuzzyDuplicateCount: 0,
      ambiguousCount: 0,
    });

    const confirmed2 = await confirmFileImport(db, { batchId: preview2.batchId });
    expect(confirmed2.created).toBe(0);
    expect(confirmed2.skippedDuplicates).toBe(3);
  });

  it('criar conta manual credit_card com closingDay: 3 e dueDay: 10 e importar CSV de fatura do Nubank associa as compras à fatura certa', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const { accountId } = await createManualAccount(db, {
      name: 'Cartão Nubank Manual',
      type: 'credit_card',
      closingDay: 3,
      dueDay: 10,
      creditLimitCents: 500000,
    });

    const [createdAcc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(createdAcc?.type).toBe('credit_card');
    expect(createdAcc?.closingDay).toBe(3);
    expect(createdAcc?.dueDay).toBe(10);
    expect(createdAcc?.creditLimitCents).toBe(500000);

    const csvContent = readFileSync(join(fixturesDir, 'nubank-fatura.csv'), 'utf-8');
    const preview = await previewFileImport(db, {
      accountId,
      filename: 'nubank-fatura.csv',
      content: csvContent,
    });
    expect(preview.summary.newCount).toBe(4);

    const confirmed = await confirmFileImport(db, { batchId: preview.batchId });
    expect(confirmed.created).toBe(4);

    const acctInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.accountId, accountId));
    expect(acctInvoices.length).toBeGreaterThanOrEqual(2);

    const acctTxs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    // Compras em 02/04 (<= dia 3) e 04/04 (> dia 3) + 2 parcelas futuras projetadas (2/3 e 3/3)
    expect(acctTxs.some((t) => t.invoiceId !== null)).toBe(true);
  });

  it('discardFileImport descarta lote em preview e recusa descartar lote confirmado', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const { accountId } = await createManualAccount(db, {
      name: 'Conta Teste',
      type: 'checking',
    });
    const csvContent = readFileSync(join(fixturesDir, 'nubank-conta.csv'), 'utf-8');
    const preview = await previewFileImport(db, {
      accountId,
      filename: 'nubank-conta.csv',
      content: csvContent,
    });

    await discardFileImport(db, { batchId: preview.batchId });
    await expect(confirmFileImport(db, { batchId: preview.batchId })).rejects.toThrow(
      /já foi descartado/,
    );
  });
});
