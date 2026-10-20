import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { recategorize } from '../commands';
import { accounts, categories, invoices, institutions, transactions, transactionSources } from '../db/schema';
import { seedBase } from '../db/seed';
import { linkInstallments, parseInstallment } from './installments';
import { assignInvoices, recalculateInvoices } from './invoices';

describe('installments ingestion parser', () => {
  it('reconhece casos obrigatórios da especificação', () => {
    expect(parseInstallment('MAGAZINE LUIZA PARC 03/10')).toEqual({
      number: 3,
      total: 10,
      base: 'MAGAZINE LUIZA',
    });

    expect(parseInstallment('Notebook Dell 3/10')).toEqual({
      number: 3,
      total: 10,
      base: 'Notebook Dell',
    });

    expect(parseInstallment('LOJA X PARCELA 1 DE 12')).toEqual({
      number: 1,
      total: 12,
      base: 'LOJA X',
    });

    expect(parseInstallment('PAGAMENTO 10/2026')).toBeNull();
    expect(parseInstallment('UBER *TRIP')).toBeNull();
    expect(parseInstallment('LOJA 13/12')).toBeNull();
  });

  it('reconhece variações com traço e parcelas no final', () => {
    expect(parseInstallment('LOJA - Parcela 3/10')).toEqual({
      number: 3,
      total: 10,
      base: 'LOJA',
    });

    expect(parseInstallment('LOJA 03/10')).toEqual({
      number: 3,
      total: 10,
      base: 'LOJA',
    });

    expect(parseInstallment('COMPRA EM LOJA 3 DE 10')).toEqual({
      number: 3,
      total: 10,
      base: 'COMPRA EM LOJA',
    });

    expect(parseInstallment('')).toBeNull();
  });
});

describe('linkInstallments (A1-04)', () => {
  async function setupCardDb() {
    const db = await createTestDb();
    await seedBase(db);
    const [inst] = await db.select().from(institutions).limit(1);
    const [card] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        type: 'credit_card',
        name: 'Cartão Parcelas',
        closingDay: 20,
        dueDay: 27,
      })
      .returning();
    return { db, card: card! };
  }

  it('parcela 1/3 chega → cria 2 projetadas (2/3, 3/3) em meses seguintes associadas às faturas certas; 2/3 real substitui a projetada sem duplicar', async () => {
    const { db, card } = await setupCardDb();

    const [p1] = await db
      .insert(transactions)
      .values({
        accountId: card.id,
        date: '2026-10-05',
        amountCents: -30000,
        descriptionRaw: 'NOTEBOOK DELL PARC 01/03',
        description: 'Notebook Dell 1/3',
        kind: 'expense',
        paymentMethod: 'credit_card_installment',
        status: 'posted',
        installmentNumber: 1,
        installmentTotal: 3,
      })
      .returning();

    await assignInvoices(db, [card.id], '2026-10-15');
    await linkInstallments(db, [p1!.id], '2026-10-15');

    // Rodar uma segunda vez não duplica projetadas
    await linkInstallments(db, [p1!.id], '2026-10-15');

    const afterFirst = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, card.id))
      .orderBy(asc(transactions.installmentNumber));

    expect(afterFirst).toHaveLength(3);
    expect(afterFirst.map((t) => ({ num: t.installmentNumber, status: t.status, date: t.date }))).toEqual([
      { num: 1, status: 'posted', date: '2026-10-05' },
      { num: 2, status: 'projected', date: '2026-11-05' },
      { num: 3, status: 'projected', date: '2026-12-05' },
    ]);

    const groupId = afterFirst[0]!.installmentGroupId;
    expect(groupId).not.toBeNull();
    expect(afterFirst.every((t) => t.installmentGroupId === groupId)).toBe(true);
    expect(afterFirst.every((t) => t.invoiceId !== null)).toBe(true);

    // Usuário categoriza a projetada 2/3 antes de a real chegar
    const [catEletronicos] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, 'compras-eletronicos'));
    await recategorize(db, {
      transactionId: afterFirst[1]!.id,
      categoryId: catEletronicos!.id,
      scope: 'this',
    });

    // Parcela 2/3 real chega no mês seguinte
    const [p2] = await db
      .insert(transactions)
      .values({
        accountId: card.id,
        date: '2026-11-05',
        amountCents: -30000,
        descriptionRaw: 'NOTEBOOK DELL PARC 02/03',
        description: 'Notebook Dell 2/3',
        kind: 'expense',
        paymentMethod: 'credit_card_installment',
        status: 'posted',
        installmentNumber: 2,
        installmentTotal: 3,
      })
      .returning();

    await assignInvoices(db, [card.id], '2026-11-10');
    await linkInstallments(db, [p2!.id], '2026-11-10');

    const afterSecond = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, card.id))
      .orderBy(asc(transactions.installmentNumber));

    expect(afterSecond).toHaveLength(3);
    expect(afterSecond.map((t) => ({ num: t.installmentNumber, status: t.status }))).toEqual([
      { num: 1, status: 'posted' },
      { num: 2, status: 'posted' },
      { num: 3, status: 'projected' },
    ]);
    expect(afterSecond[1]!.id).toBe(p2!.id);
    expect(afterSecond[1]!.installmentGroupId).toBe(groupId);
    // Herdou a categoria definida pelo usuário na projetada substituída
    expect(afterSecond[1]!.categoryId).toBe(catEletronicos!.id);
    expect(afterSecond[1]!.categorySource).toBe('user');

    // Cada fatura mensal tem total de 30000 centavos
    const invRows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.accountId, card.id))
      .orderBy(asc(invoices.referenceMonth));
    expect(invRows).toHaveLength(3);
    expect(invRows.map((i) => ({ month: i.referenceMonth, total: i.totalCents }))).toEqual([
      { month: '2026-10-01', total: 30000 },
      { month: '2026-11-01', total: 30000 },
      { month: '2026-12-01', total: 30000 },
    ]);
  });

  it('duas compras parceladas diferentes com mesmo valor e mesmo mês mas descrições diferentes ficam em grupos diferentes', async () => {
    const { db, card } = await setupCardDb();

    const [txA, txB] = await db
      .insert(transactions)
      .values([
        {
          accountId: card.id,
          date: '2026-10-08',
          amountCents: -15000,
          descriptionRaw: 'LOJA A PARC 01/02',
          description: 'Loja A 1/2',
          kind: 'expense',
          paymentMethod: 'credit_card_installment',
          status: 'posted',
          installmentNumber: 1,
          installmentTotal: 2,
        },
        {
          accountId: card.id,
          date: '2026-10-08',
          amountCents: -15000,
          descriptionRaw: 'LOJA B PARC 01/02',
          description: 'Loja B 1/2',
          kind: 'expense',
          paymentMethod: 'credit_card_installment',
          status: 'posted',
          installmentNumber: 1,
          installmentTotal: 2,
        },
      ])
      .returning();

    await assignInvoices(db, [card.id], '2026-10-15');
    await linkInstallments(db, [txA!.id, txB!.id], '2026-10-15');
    await recalculateInvoices(db, [card.id], '2026-10-15');

    const [rowA] = await db.select().from(transactions).where(eq(transactions.id, txA!.id));
    const [rowB] = await db.select().from(transactions).where(eq(transactions.id, txB!.id));

    expect(rowA!.installmentGroupId).not.toBeNull();
    expect(rowB!.installmentGroupId).not.toBeNull();
    expect(rowA!.installmentGroupId).not.toBe(rowB!.installmentGroupId);

    const allTxs = await db.select().from(transactions).where(eq(transactions.accountId, card.id));
    expect(allTxs).toHaveLength(4); // 2 reais + 2 projetadas
  });

  it('parcela real com duas fontes (Pluggy + arquivo) é processada uma vez e herda a categoria do usuário da projetada', async () => {
    const { db, card } = await setupCardDb();
    const base = {
      accountId: card.id,
      amountCents: -10000,
      kind: 'expense' as const,
      paymentMethod: 'credit_card_installment' as const,
      installmentTotal: 3,
    };
    const [tx1] = await db
      .insert(transactions)
      .values({ ...base, date: '2026-08-10', descriptionRaw: 'LOJA X 1/3', description: 'Loja X 1/3', installmentNumber: 1 })
      .returning();
    await linkInstallments(db, [tx1!.id], '2026-08-15');

    const [proj2] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.installmentNumber, 2), eq(transactions.status, 'projected')));
    const [cat] = await db.select().from(categories).where(eq(categories.kind, 'expense')).limit(1);
    await recategorize(db, { transactionId: proj2!.id, categoryId: cat!.id, scope: 'this' });

    const [tx2] = await db
      .insert(transactions)
      .values({ ...base, date: '2026-09-10', descriptionRaw: 'LOJA X 2/3', description: 'Loja X 2/3', installmentNumber: 2 })
      .returning();
    await db.insert(transactionSources).values([
      { transactionId: tx2!.id, source: 'pluggy', externalId: 'pl-2', raw: { creditCardMetadata: { purchaseDate: '2026-08-10' } } },
      { transactionId: tx2!.id, source: 'file', externalId: 'file-2', raw: { memo: 'LOJA X 2/3' } },
    ]);

    const res = await linkInstallments(db, [tx2!.id], '2026-09-15');

    expect(res.linked).toBe(1);
    const [after] = await db.select().from(transactions).where(eq(transactions.id, tx2!.id));
    expect(after!.categoryId).toBe(cat!.id);
  });

  it('parcela real substitui a projetada mesmo quando a projetada tem partes de divisão (dados antigos)', async () => {
    const { db, card } = await setupCardDb();
    const base = {
      accountId: card.id,
      amountCents: -10000,
      kind: 'expense' as const,
      paymentMethod: 'credit_card_installment' as const,
      installmentTotal: 3,
    };
    const [tx1] = await db
      .insert(transactions)
      .values({ ...base, date: '2026-08-10', descriptionRaw: 'LOJA Y 1/3', description: 'Loja Y 1/3', installmentNumber: 1 })
      .returning();
    await linkInstallments(db, [tx1!.id], '2026-08-15');
    const [proj2] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.installmentNumber, 2), eq(transactions.status, 'projected')));
    // Divisão da projetada feita antes de o comando passar a recusar; depois o usuário categoriza a mãe
    // (a nova versão da linha da mãe fica depois das partes, que passam a vir primeiro na consulta)
    await db.insert(transactions).values(
      [-6000, -4000].map((amountCents) => ({
        ...base,
        amountCents,
        date: proj2!.date,
        descriptionRaw: proj2!.descriptionRaw,
        description: proj2!.description,
        status: 'projected' as const,
        installmentGroupId: proj2!.installmentGroupId,
        installmentNumber: 2,
        parentTransactionId: proj2!.id,
      })),
    );
    const [cat] = await db.select().from(categories).where(eq(categories.kind, 'expense')).limit(1);
    await db
      .update(transactions)
      .set({ categoryId: cat!.id, installmentGroupId: proj2!.installmentGroupId })
      .where(eq(transactions.id, proj2!.id));

    const [tx2] = await db
      .insert(transactions)
      .values({ ...base, date: '2026-09-10', descriptionRaw: 'LOJA Y 2/3', description: 'Loja Y 2/3', installmentNumber: 2 })
      .returning();
    await linkInstallments(db, [tx2!.id], '2026-09-15');

    const leftover = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.installmentNumber, 2), eq(transactions.status, 'projected')));
    expect(leftover).toHaveLength(0);
  });
});
