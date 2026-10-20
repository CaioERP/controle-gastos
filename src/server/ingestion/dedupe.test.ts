import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { confirmFileImport, previewFileImport } from '@/server/commands/imports';
import { createManualAccount } from '@/server/commands/manual';
import { recategorize } from '@/server/commands/transactions';
import { categories, transactions, transactionSources } from '@/server/db/schema';
import { seedBase } from '@/server/db/seed';
import { defaultFilters } from '@/server/domain/filters';
import { getSpendingSummary } from '@/server/queries/summary';
import { createTestDb } from '../../../tests/helpers/db';
import {
  descriptionSimilarity,
  findCrossSourceMatches,
  normalizeDescriptionForDedupe,
} from './dedupe';
import { upsertTransaction } from './persist';

describe('descriptionSimilarity e normalizeDescriptionForDedupe (A2-03)', () => {
  it('remove prefixos de adquirente, parcelas e ruídos e calcula similaridade nos casos obrigatórios', () => {
    expect(normalizeDescriptionForDedupe('IFD*IFOOD RESTAURANTE')).toBe('ifood restaurante');
    expect(normalizeDescriptionForDedupe('Ifood 1/1')).toBe('ifood');

    expect(descriptionSimilarity('IFD*IFOOD RESTAURANTE', 'Ifood 1/1')).toBeGreaterThanOrEqual(
      0.6,
    );
    expect(
      descriptionSimilarity('UBER *TRIP HELP.UBER.COM', 'Uber Do Brasil'),
    ).toBeGreaterThanOrEqual(0.6);
    expect(descriptionSimilarity('PADARIA REAL', 'FARMACIA DROGASIL')).toBeLessThan(0.3);
  });
});

describe('Deduplicação entre fontes no banco (A2-03)', () => {
  it('compra sincronizada pelo Pluggy em 2026-10-10 + importação CSV em 2026-10-11 marca fuzzy_duplicate, vincula na confirmação e não muda o total de gastos', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const { accountId } = await createManualAccount(db, {
      name: 'Conta Corrente',
      type: 'checking',
    });

    // 1. Insere transação vinda do Pluggy em 2026-10-10 (-4590, "IFD*IFOOD")
    const pluggyUpsert = await upsertTransaction(db, accountId, {
      source: 'pluggy',
      externalId: 'pluggy-tx-ifood-1',
      accountExternalId: accountId,
      date: '2026-10-10',
      amountCents: -4590,
      currency: 'BRL',
      descriptionRaw: 'IFD*IFOOD',
      description: 'Ifood',
      merchantName: 'Ifood',
      paymentMethod: 'debit_card',
      status: 'posted',
      cardLast4: null,
      invoiceExternalId: null,
      providerCategoryId: null,
      installment: null,
      raw: { id: 'pluggy-tx-ifood-1' },
    });

    const filters = {
      ...defaultFilters('2026-10-15'),
      from: '2026-10-01',
      to: '2026-10-31',
    };
    const summaryBefore = await getSpendingSummary(db, filters);
    expect(summaryBefore.expenseCents).toBe(4590);

    // 2. Importa CSV com compra em 2026-10-11 (-45.90, "iFood Restaurante")
    const csvContent = [
      'Data,Valor,Identificador,Descrição',
      '11/10/2026,-45.90,id-csv-1,iFood Restaurante',
    ].join('\n');

    const preview = await previewFileImport(db, {
      accountId,
      filename: 'nubank.csv',
      content: csvContent,
    });

    expect(preview.summary.fuzzyDuplicateCount).toBe(1);
    expect(preview.items[0]?.status).toBe('fuzzy_duplicate');
    expect(preview.items[0]?.matchedTransactionId).toBe(pluggyUpsert.id);

    const confirmed = await confirmFileImport(db, { batchId: preview.batchId });
    expect(confirmed).toEqual({
      batchId: preview.batchId,
      created: 0,
      linked: 1,
      skippedDuplicates: 0,
    });

    const allTxs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(allTxs).toHaveLength(1);
    // Prioridade Pluggy > file: mantém data 2026-10-10 do Pluggy
    expect(allTxs[0]?.date).toBe('2026-10-10');

    const sources = await db
      .select()
      .from(transactionSources)
      .where(eq(transactionSources.transactionId, pluggyUpsert.id));
    expect(sources.map((s) => s.source).sort()).toEqual(['file', 'pluggy']);

    const summaryAfter = await getSpendingSummary(db, filters);
    expect(summaryAfter.expenseCents).toBe(4590);
  });

  it('caminho inverso: arquivo importado primeiro e depois upsertTransaction com source=pluggy vincula à existente, atualiza providerCategoryId e preserva categoria editada pelo usuário (R9)', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const { accountId } = await createManualAccount(db, {
      name: 'Conta Corrente',
      type: 'checking',
    });

    const csvContent = [
      'Data,Valor,Identificador,Descrição',
      '10/10/2026,-45.90,id-csv-inv,iFood Restaurante',
    ].join('\n');

    const preview = await previewFileImport(db, {
      accountId,
      filename: 'nubank.csv',
      content: csvContent,
    });
    await confirmFileImport(db, { batchId: preview.batchId });

    const [fileTx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));
    expect(fileTx).toBeDefined();

    // Usuário categoriza manualmente (R9)
    const [cat] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, 'alimentacao-delivery'));
    await recategorize(db, {
      transactionId: fileTx!.id,
      categoryId: cat!.id,
      scope: 'this',
    });

    // Agora chega pelo Pluggy
    const pluggyRes = await upsertTransaction(db, accountId, {
      source: 'pluggy',
      externalId: 'pluggy-tx-inv-1',
      accountExternalId: accountId,
      date: '2026-10-10',
      amountCents: -4590,
      currency: 'BRL',
      descriptionRaw: 'IFD*IFOOD',
      description: 'Ifood',
      merchantName: 'Ifood',
      paymentMethod: 'pix',
      status: 'posted',
      cardLast4: null,
      invoiceExternalId: null,
      providerCategoryId: 'pluggy-food-cat',
      installment: null,
      raw: { id: 'pluggy-tx-inv-1' },
    });

    expect(pluggyRes).toEqual({
      id: fileTx!.id,
      created: false,
      changed: true,
    });

    const [afterTx] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, fileTx!.id));
    expect(afterTx?.providerCategoryId).toBe('pluggy-food-cat');
    expect(afterTx?.categoryId).toBe(cat!.id);
    expect(afterTx?.categorySource).toBe('user');

    const sources = await db
      .select()
      .from(transactionSources)
      .where(eq(transactionSources.transactionId, fileTx!.id));
    expect(sources.map((s) => s.source).sort()).toEqual(['file', 'pluggy']);
  });

  it('duas compras idênticas no mesmo restaurante em dias seguidos (10/10 e 11/10) retornam ambiguous_duplicate quando ambíguas', async () => {
    const db = await createTestDb();
    await seedBase(db);
    const { accountId } = await createManualAccount(db, {
      name: 'Conta Corrente',
      type: 'checking',
    });

    await upsertTransaction(db, accountId, {
      source: 'pluggy',
      externalId: 'pluggy-amb-1',
      accountExternalId: accountId,
      date: '2026-10-10',
      amountCents: -3500,
      currency: 'BRL',
      descriptionRaw: 'RESTAURANTE SABOR CASEIRO SP',
      description: 'Restaurante Sabor Caseiro Sp',
      merchantName: 'Restaurante Sabor Caseiro',
      paymentMethod: 'debit_card',
      status: 'posted',
      cardLast4: null,
      invoiceExternalId: null,
      providerCategoryId: null,
      installment: null,
      raw: {},
    });

    await upsertTransaction(db, accountId, {
      source: 'pluggy',
      externalId: 'pluggy-amb-2',
      accountExternalId: accountId,
      date: '2026-10-11',
      amountCents: -3500,
      currency: 'BRL',
      descriptionRaw: 'RESTAURANTE SABOR CASEIRO SP',
      description: 'Restaurante Sabor Caseiro Sp',
      merchantName: 'Restaurante Sabor Caseiro',
      paymentMethod: 'debit_card',
      status: 'posted',
      cardLast4: null,
      invoiceExternalId: null,
      providerCategoryId: null,
      installment: null,
      raw: {},
    });

    // Descrição similar (Dice >= 0.6 e < 0.85, sem substring direta) em 10/10 -> ambígua entre 10/10 e 11/10
    const match = await findCrossSourceMatches(db, accountId, {
      source: 'file',
      date: '2026-10-10',
      amountCents: -3500,
      description: 'Restaurante Sabor Mineiro',
      descriptionRaw: 'RESTAURANTE SABOR MINEIRO',
    });

    expect(match.status).toBe('ambiguous_duplicate');
    expect(match.matchedTransactionId).toBeNull();
    expect(match.candidates).toHaveLength(2);
  });
});
