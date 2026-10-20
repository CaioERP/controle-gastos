import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../tests/helpers/db';
import { updateTransaction } from '../commands';
import { accounts, categories, invoices, institutions, transactions } from '../db/schema';
import { seedBase } from '../db/seed';
import type { AccountType, TxKind } from '../domain/enums';
import { classifyKinds, classifySingleKind, findTransferPairs } from './classify-kind';

describe('classifySingleKind — tabela de casos puros (A1-05)', () => {
  const cases: Array<{
    label: string;
    accountType: AccountType;
    amountCents: number;
    description: string;
    matchedInvoice?: boolean;
    expected: TxKind;
  }> = [
    {
      label: 'pagamento de fatura por texto na conta corrente',
      accountType: 'checking',
      amountCents: -120000,
      description: 'PAGAMENTO DE FATURA CARTAO NUBANK',
      expected: 'invoice_payment',
    },
    {
      label: 'pagamento de fatura por valor e data (sem palavra-chave no texto)',
      accountType: 'checking',
      amountCents: -85000,
      description: 'DEB AUTOMATICO ITAU',
      matchedInvoice: true,
      expected: 'invoice_payment',
    },
    {
      label: 'pagamento de fatura no lado do cartão',
      accountType: 'credit_card',
      amountCents: 120000,
      description: 'Pagamento recebido',
      expected: 'invoice_payment',
    },
    {
      label: 'aplicação em CDB / caixinha (investimento)',
      accountType: 'checking',
      amountCents: -50000,
      description: 'Aplicação RDB Caixinha Reserva',
      expected: 'investment',
    },
    {
      label: 'resgate de investimento',
      accountType: 'checking',
      amountCents: 30000,
      description: 'Resgate Tesouro Selic',
      expected: 'investment',
    },
    {
      label: 'estorno no cartão de crédito (valor positivo sem ser pagamento)',
      accountType: 'credit_card',
      amountCents: 4590,
      description: 'IFD*IFOOD RESTAURANTE',
      expected: 'refund',
    },
    {
      label: 'estorno na conta corrente por descrição',
      accountType: 'checking',
      amountCents: 2500,
      description: 'ESTORNO COMPRA DEBITO',
      expected: 'refund',
    },
    {
      label: 'despesa padrão',
      accountType: 'checking',
      amountCents: -3500,
      description: 'PADARIA REAL',
      expected: 'expense',
    },
    {
      label: 'receita padrão',
      accountType: 'checking',
      amountCents: 500000,
      description: 'SALARIO MENSAL',
      expected: 'income',
    },
  ];

  it.each(cases)('$label → $expected', ({ accountType, amountCents, description, matchedInvoice, expected }) => {
    expect(
      classifySingleKind({
        accountType,
        amountCents,
        description,
        matchedInvoice: matchedInvoice ?? false,
      }),
    ).toBe(expected);
  });
});

describe('findTransferPairs — pareamento puro (A1-05)', () => {
  it('escolhe a candidata de data mais próxima quando há duas opções com datas diferentes', () => {
    const res = findTransferPairs([
      {
        id: 'debit-itau',
        accountId: 'acc-itau',
        date: '2026-10-10',
        amountCents: -50000,
        paymentMethod: 'pix',
        transferGroupId: null,
      },
      {
        id: 'credit-nu-far',
        accountId: 'acc-nu',
        date: '2026-10-12',
        amountCents: 50000,
        paymentMethod: 'pix',
        transferGroupId: null,
      },
      {
        id: 'credit-nu-close',
        accountId: 'acc-nu',
        date: '2026-10-10',
        amountCents: 50000,
        paymentMethod: 'pix',
        transferGroupId: null,
      },
    ]);

    expect(res.pairs).toEqual([{ debitId: 'debit-itau', creditId: 'credit-nu-close' }]);
    expect(res.ambiguousIds).toEqual([]);
  });

  it('em caso de empate na distância de datas, não pareia e marca ambas para revisão', () => {
    const res = findTransferPairs([
      {
        id: 'debit-itau',
        accountId: 'acc-itau',
        date: '2026-10-10',
        amountCents: -50000,
        paymentMethod: 'pix',
        transferGroupId: null,
      },
      {
        id: 'credit-nu-1',
        accountId: 'acc-nu',
        date: '2026-10-09',
        amountCents: 50000,
        paymentMethod: 'pix',
        transferGroupId: null,
      },
      {
        id: 'credit-mp-2',
        accountId: 'acc-mp',
        date: '2026-10-11',
        amountCents: 50000,
        paymentMethod: 'pix',
        transferGroupId: null,
      },
    ]);

    expect(res.pairs).toEqual([]);
    expect(res.ambiguousIds.sort()).toEqual(['credit-mp-2', 'credit-nu-1', 'debit-itau']);
  });
});

describe('classifyKinds no banco (A1-05)', () => {
  async function setupAccounts() {
    const db = await createTestDb();
    await seedBase(db);
    const insts = await db.select().from(institutions);
    const nubank = insts.find((i) => i.slug === 'nubank') ?? insts[0]!;
    const itau = insts.find((i) => i.slug === 'itau') ?? insts[0]!;

    const [accNu, accItau, cardNu] = await db
      .insert(accounts)
      .values([
        { institutionId: nubank.id, type: 'checking', name: 'Conta Nubank' },
        { institutionId: itau.id, type: 'checking', name: 'Conta Itaú' },
        { institutionId: nubank.id, type: 'credit_card', name: 'Cartão Nubank', closingDay: 10, dueDay: 17 },
      ])
      .returning();

    const [catMercado] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, 'alimentacao-mercado'));

    return { db, accNu: accNu!, accItau: accItau!, cardNu: cardNu!, catMercado: catMercado! };
  }

  it('identifica pagamento de fatura por valor e data (±1%, até 5 dias), marca a fatura como paga e zera categoria (R8)', async () => {
    const { db, accItau, cardNu, catMercado } = await setupAccounts();

    const [inv] = await db
      .insert(invoices)
      .values({
        accountId: cardNu.id,
        referenceMonth: '2026-10-01',
        closingDate: '2026-10-10',
        dueDate: '2026-10-17',
        totalCents: 100000,
        status: 'closed',
      })
      .returning();

    const [payTx] = await db
      .insert(transactions)
      .values({
        accountId: accItau.id,
        date: '2026-10-16', // 1 dia antes do vencimento
        amountCents: -100500, // +0.5% dentro da tolerância de ±1%
        descriptionRaw: 'PAGTO TITULO BANCARIO',
        description: 'Pagto Titulo Bancario',
        kind: 'expense',
        paymentMethod: 'boleto',
        categoryId: catMercado.id,
        categorySource: 'provider',
        needsReview: true,
      })
      .returning();

    await classifyKinds(db, [payTx!.id], '2026-10-18');

    const [updatedTx] = await db.select().from(transactions).where(eq(transactions.id, payTx!.id));
    expect(updatedTx!.kind).toBe('invoice_payment');
    expect(updatedTx!.categoryId).toBeNull();
    expect(updatedTx!.categorySource).toBe('default');
    expect(updatedTx!.needsReview).toBe(false);

    const [updatedInv] = await db.select().from(invoices).where(eq(invoices.id, inv!.id));
    expect(updatedInv!.status).toBe('paid');
    expect(updatedInv!.paidAt).toBe('2026-10-16');
    expect(updatedInv!.paidAmountCents).toBe(100500);
  });

  it('pareia transferência entre Itaú e Nubank e rodar 2 vezes não cria segundo transferGroupId', async () => {
    const { db, accNu, accItau, catMercado } = await setupAccounts();

    const [txOut, txIn] = await db
      .insert(transactions)
      .values([
        {
          accountId: accItau.id,
          date: '2026-10-10',
          amountCents: -75000,
          descriptionRaw: 'PIX ENVIADO MESMA TITULARIDADE',
          description: 'Pix Enviado Mesma Titularidade',
          kind: 'expense',
          paymentMethod: 'pix',
          categoryId: catMercado.id,
          categorySource: 'provider',
          needsReview: true,
        },
        {
          accountId: accNu.id,
          date: '2026-10-11',
          amountCents: 75000,
          descriptionRaw: 'PIX RECEBIDO',
          description: 'Pix Recebido',
          kind: 'income',
          paymentMethod: 'pix',
        },
      ])
      .returning();

    // Passando apenas txOut no contexto: deve buscar txIn na janela de ±3 dias do banco
    await classifyKinds(db, [txOut!.id], '2026-10-15');

    const [out1] = await db.select().from(transactions).where(eq(transactions.id, txOut!.id));
    const [in1] = await db.select().from(transactions).where(eq(transactions.id, txIn!.id));

    expect(out1!.kind).toBe('transfer');
    expect(in1!.kind).toBe('transfer');
    expect(out1!.transferGroupId).not.toBeNull();
    expect(out1!.transferGroupId).toBe(in1!.transferGroupId);
    expect(out1!.categoryId).toBeNull();
    expect(out1!.needsReview).toBe(false);

    const groupId1 = out1!.transferGroupId;

    // Rodar uma segunda vez não cria um segundo transferGroupId
    await classifyKinds(db, [txOut!.id, txIn!.id], '2026-10-15');

    const [out2] = await db.select().from(transactions).where(eq(transactions.id, txOut!.id));
    const [in2] = await db.select().from(transactions).where(eq(transactions.id, txIn!.id));
    expect(out2!.transferGroupId).toBe(groupId1);
    expect(in2!.transferGroupId).toBe(groupId1);
  });

  it('empate de transferência no banco marca as candidatas com needsReview = true sem parear', async () => {
    const { db, accNu, accItau } = await setupAccounts();

    const [txDebit, txCred1, txCred2] = await db
      .insert(transactions)
      .values([
        {
          accountId: accItau.id,
          date: '2026-10-10',
          amountCents: -30000,
          descriptionRaw: 'PIX ENVIADO',
          description: 'Pix Enviado',
          kind: 'expense',
          paymentMethod: 'pix',
          needsReview: false,
        },
        {
          accountId: accNu.id,
          date: '2026-10-10',
          amountCents: 30000,
          descriptionRaw: 'PIX RECEBIDO 1',
          description: 'Pix Recebido 1',
          kind: 'income',
          paymentMethod: 'pix',
          needsReview: false,
        },
        {
          accountId: accNu.id,
          date: '2026-10-10',
          amountCents: 30000,
          descriptionRaw: 'PIX RECEBIDO 2',
          description: 'Pix Recebido 2',
          kind: 'income',
          paymentMethod: 'pix',
          needsReview: false,
        },
      ])
      .returning();

    await classifyKinds(db, [txDebit!.id, txCred1!.id, txCred2!.id], '2026-10-15');

    const [d] = await db.select().from(transactions).where(eq(transactions.id, txDebit!.id));
    const [c1] = await db.select().from(transactions).where(eq(transactions.id, txCred1!.id));
    const [c2] = await db.select().from(transactions).where(eq(transactions.id, txCred2!.id));

    expect(d!.transferGroupId).toBeNull();
    expect(c1!.transferGroupId).toBeNull();
    expect(c2!.transferGroupId).toBeNull();
    expect(d!.needsReview).toBe(true);
    expect(c1!.needsReview).toBe(true);
    expect(c2!.needsReview).toBe(true);
  });

  it('R9: kind editado pelo usuário não muda', async () => {
    const { db, accNu } = await setupAccounts();

    const [tx] = await db
      .insert(transactions)
      .values({
        accountId: accNu.id,
        date: '2026-10-12',
        amountCents: -20000,
        descriptionRaw: 'APLICACAO CAIXINHA NUBANK',
        description: 'Aplicacao Caixinha Nubank',
        kind: 'expense',
        paymentMethod: 'other',
      })
      .returning();

    await updateTransaction(db, {
      transactionId: tx!.id,
      patch: { kind: 'expense' },
    });

    await classifyKinds(db, [tx!.id], '2026-10-15');

    const [after] = await db.select().from(transactions).where(eq(transactions.id, tx!.id));
    expect(after!.kind).toBe('expense');
  });
});
