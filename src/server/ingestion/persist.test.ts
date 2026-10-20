import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { updateAccount, updateTransaction } from '../commands';
import type { Db } from '../db/client';
import { accounts, cards, connections, transactions, transactionSources } from '../db/schema';
import { seedBase } from '../db/seed';
import { upsertAccount, upsertCard, upsertTransaction } from './persist';
import type { NormalizedTransaction, RawAccount } from './types';

describe('persist (A1-03)', () => {
  let db: Db;
  let connectionId: string;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    const [conn] = await db
      .insert(connections)
      .values({ provider: 'pluggy', externalId: 'item-persist-1', status: 'active' })
      .returning();
    connectionId = conn!.id;
  });

  it('upsertAccount cria e atualiza preservando configurações do usuário e closingDay/dueDay quando ausentes na fonte', async () => {
    const raw: RawAccount = {
      externalId: 'acc-ext-1',
      institutionName: 'Nu Pagamentos S.A.',
      type: 'credit_card',
      name: 'Roxinho',
      balanceCents: -50000,
      currency: 'BRL',
      creditLimitCents: 1000000,
      availableLimitCents: 950000,
      closingDay: 10,
      dueDay: 17,
      raw: { id: 'acc-ext-1' },
    };

    const accountId = await upsertAccount(db, connectionId, raw);

    await updateAccount(db, {
      accountId,
      patch: {
        displayName: 'Cartão Principal',
        isHidden: true,
        includeInTotals: false,
        closingDay: 12,
        dueDay: 19,
      },
    });

    // Fonte atualiza saldo mas manda closingDay/dueDay nulos
    const accountId2 = await upsertAccount(db, connectionId, {
      ...raw,
      balanceCents: -75000,
      closingDay: null,
      dueDay: null,
    });

    expect(accountId2).toBe(accountId);
    const [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(acc!.balanceCents).toBe(-75000);
    expect(acc!.displayName).toBe('Cartão Principal');
    expect(acc!.isHidden).toBe(true);
    expect(acc!.includeInTotals).toBe(false);
    expect(acc!.closingDay).toBe(12);
    expect(acc!.dueDay).toBe(19);
  });

  it('upsertCard é idempotente por (accountId, last4)', async () => {
    const accountId = await upsertAccount(db, connectionId, {
      externalId: 'acc-ext-card',
      institutionName: 'Itaú',
      type: 'credit_card',
      name: 'Itaucard',
      balanceCents: -10000,
      currency: 'BRL',
      raw: {},
    });

    const c1 = await upsertCard(db, accountId, '1234');
    const c2 = await upsertCard(db, accountId, '1234');
    expect(c2).toBe(c1);

    const rows = await db.select().from(cards).where(eq(cards.accountId, accountId));
    expect(rows).toHaveLength(1);
  });

  it('upsertTransaction é idempotente, não atualiza updatedAt sem mudanças e respeita user_edited_fields (R9)', async () => {
    const accountId = await upsertAccount(db, connectionId, {
      externalId: 'acc-ext-tx',
      institutionName: 'Nubank',
      type: 'checking',
      name: 'Conta Corrente',
      balanceCents: 100000,
      currency: 'BRL',
      raw: {},
    });

    const baseTx: NormalizedTransaction = {
      source: 'pluggy',
      externalId: 'tx-ext-100',
      accountExternalId: 'acc-ext-tx',
      date: '2026-10-10',
      amountCents: -4590,
      currency: 'BRL',
      descriptionRaw: 'IFD*IFOOD RESTAURANTE',
      description: 'Ifd*ifood Restaurante',
      merchantName: 'Ifood',
      paymentMethod: 'debit_card',
      status: 'posted',
      cardLast4: null,
      invoiceExternalId: null,
      providerCategoryId: 'cat-food',
      installment: null,
      raw: { id: 'tx-ext-100', v: 1 },
    };

    const res1 = await upsertTransaction(db, accountId, baseTx);
    expect(res1.created).toBe(true);
    expect(res1.changed).toBe(false);

    const [txBefore] = await db.select().from(transactions).where(eq(transactions.id, res1.id));

    await new Promise((r) => setTimeout(r, 15));

    // Mesmos dados → changed: false e updatedAt inalterado
    const res2 = await upsertTransaction(db, accountId, { ...baseTx, raw: { id: 'tx-ext-100', v: 2 } });
    expect(res2.created).toBe(false);
    expect(res2.changed).toBe(false);

    const [txAfterNoChange] = await db.select().from(transactions).where(eq(transactions.id, res1.id));
    expect(txAfterNoChange!.updatedAt.getTime()).toBe(txBefore!.updatedAt.getTime());

    const [srcAfter] = await db
      .select()
      .from(transactionSources)
      .where(eq(transactionSources.transactionId, res1.id));
    expect(srcAfter!.raw).toEqual({ id: 'tx-ext-100', v: 2 });

    // Usuário edita a descrição (R9)
    await updateTransaction(db, {
      transactionId: res1.id,
      patch: { description: 'Almoço de Domingo' },
    });

    // Fonte muda descrição e valor: descrição do usuário é mantida, valor é atualizado
    const res3 = await upsertTransaction(db, accountId, {
      ...baseTx,
      description: 'Ifood Outra Descricao',
      amountCents: -5200,
    });
    expect(res3.created).toBe(false);
    expect(res3.changed).toBe(true);

    const [txFinal] = await db.select().from(transactions).where(eq(transactions.id, res1.id));
    expect(txFinal!.description).toBe('Almoço de Domingo');
    expect(txFinal!.amountCents).toBe(-5200);
  });
});
