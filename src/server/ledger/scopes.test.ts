import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import type { Db } from '@/server/db/client';
import { accounts, institutions, invoices, transactions } from '@/server/db/schema';
import { globalSearch } from '@/server/queries/search';
import { getReviewCount } from '@/server/queries/transactions';
import { getInvoiceItems } from '@/server/queries/invoices';
import {
  accountInTotals,
  accountVisible,
  txLive,
  txNotProjected,
  txPosted,
} from './scopes';

describe('Livro-razão: recortes nomeados (A6-07)', () => {
  let db: Db;
  let accId: string;
  let hiddenAccId: string;
  let notInTotalsAccId: string;
  let invoiceId: string;

  let motherId: string;
  let child1Id: string;
  let child2Id: string;
  let deletedId: string;
  let projectedId: string;
  let pendingId: string;
  let postedId: string;

  beforeAll(async () => {
    db = await createTestDb();

    // 1. Instituição e contas
    const [inst] = await db
      .insert(institutions)
      .values({
        name: 'Banco Teste',
        slug: 'banco-teste',
        color: '#000000',
      })
      .returning();

    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Cartão Principal',
        type: 'credit_card',
        isHidden: false,
        includeInTotals: true,
      })
      .returning();
    accId = acc!.id;

    const [hiddenAcc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Conta Oculta',
        type: 'checking',
        isHidden: true,
        includeInTotals: true,
      })
      .returning();
    hiddenAccId = hiddenAcc!.id;

    const [notInTotalsAcc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Conta Fora dos Totais',
        type: 'checking',
        isHidden: false,
        includeInTotals: false,
      })
      .returning();
    notInTotalsAccId = notInTotalsAcc!.id;

    // 2. Fatura
    const [inv] = await db
      .insert(invoices)
      .values({
        accountId: accId,
        referenceMonth: '2026-10-01',
        closingDate: '2026-10-20',
        dueDate: '2026-10-27',
        status: 'open',
        totalCents: 10000,
      })
      .returning();
    invoiceId = inv!.id;

    // 3. Transações de teste
    motherId = crypto.randomUUID();
    child1Id = crypto.randomUUID();
    child2Id = crypto.randomUUID();
    deletedId = crypto.randomUUID();
    projectedId = crypto.randomUUID();
    pendingId = crypto.randomUUID();
    postedId = crypto.randomUUID();

    await db.insert(transactions).values([
      // Apagada
      {
        id: deletedId,
        accountId: accId,
        date: '2026-10-01',
        amountCents: -5000,
        description: 'Transação apagada',
        descriptionRaw: 'Transação apagada',
        status: 'posted',
        kind: 'expense',
        paymentMethod: 'pix',
        deletedAt: new Date(),
        needsReview: false,
      },
      // Mãe de divisão (ativa no banco, mas com filhas ativas)
      {
        id: motherId,
        accountId: accId,
        date: '2026-10-02',
        amountCents: -10000,
        description: 'Mãe dividida Mercado',
        descriptionRaw: 'Mãe dividida Mercado',
        status: 'posted',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        invoiceId,
        needsReview: true,
        deletedAt: null,
      },
      // Filha 1
      {
        id: child1Id,
        parentTransactionId: motherId,
        accountId: accId,
        date: '2026-10-02',
        amountCents: -6000,
        description: 'Filha 1 Alimentação',
        descriptionRaw: 'Filha 1 Alimentação',
        status: 'posted',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        invoiceId,
        needsReview: false,
        deletedAt: null,
      },
      // Filha 2
      {
        id: child2Id,
        parentTransactionId: motherId,
        accountId: accId,
        date: '2026-10-02',
        amountCents: -4000,
        description: 'Filha 2 Limpeza',
        descriptionRaw: 'Filha 2 Limpeza',
        status: 'posted',
        kind: 'expense',
        paymentMethod: 'credit_card_single',
        invoiceId,
        needsReview: false,
        deletedAt: null,
      },
      // Projetada
      {
        id: projectedId,
        accountId: accId,
        date: '2026-10-03',
        amountCents: -3000,
        description: 'Parcela futura projetada',
        descriptionRaw: 'Parcela futura projetada',
        status: 'projected',
        kind: 'expense',
        paymentMethod: 'credit_card_installment',
        deletedAt: null,
        needsReview: false,
      },
      // Pendente
      {
        id: pendingId,
        accountId: accId,
        date: '2026-10-04',
        amountCents: -2000,
        description: 'Transação pendente',
        descriptionRaw: 'Transação pendente',
        status: 'pending',
        kind: 'expense',
        paymentMethod: 'pix',
        deletedAt: null,
        needsReview: false,
      },
      // Realizada (posted)
      {
        id: postedId,
        accountId: accId,
        date: '2026-10-05',
        amountCents: -1000,
        description: 'Transação realizada',
        descriptionRaw: 'Transação realizada',
        status: 'posted',
        kind: 'expense',
        paymentMethod: 'pix',
        deletedAt: null,
        needsReview: false,
      },
      // Transação em conta oculta
      {
        id: crypto.randomUUID(),
        accountId: hiddenAccId,
        date: '2026-10-06',
        amountCents: -1500,
        description: 'Transação em conta oculta',
        descriptionRaw: 'Transação em conta oculta',
        status: 'posted',
        kind: 'expense',
        paymentMethod: 'pix',
        deletedAt: null,
        needsReview: false,
      },
      // Transação em conta fora dos totais
      {
        id: crypto.randomUUID(),
        accountId: notInTotalsAccId,
        date: '2026-10-07',
        amountCents: -2500,
        description: 'Transação fora dos totais',
        descriptionRaw: 'Transação fora dos totais',
        status: 'posted',
        kind: 'expense',
        paymentMethod: 'pix',
        deletedAt: null,
        needsReview: false,
      },
    ]);
  });

  describe('contagem de linhas por recorte na conta principal', () => {
    it('txLive devolve 5 linhas (exclui apagada e mãe dividida)', async () => {
      const rows = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.accountId, accId), txLive));

      expect(rows).toHaveLength(5);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(child1Id);
      expect(ids).toContain(child2Id);
      expect(ids).toContain(projectedId);
      expect(ids).toContain(pendingId);
      expect(ids).toContain(postedId);
      expect(ids).not.toContain(deletedId);
      expect(ids).not.toContain(motherId);
    });

    it('txPosted devolve 3 linhas (posted não apagada e não mãe)', async () => {
      const rows = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.accountId, accId), txPosted));

      expect(rows).toHaveLength(3);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(child1Id);
      expect(ids).toContain(child2Id);
      expect(ids).toContain(postedId);
      expect(ids).not.toContain(pendingId);
      expect(ids).not.toContain(projectedId);
    });

    it('txNotProjected devolve 4 linhas (posted e pending)', async () => {
      const rows = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.accountId, accId), txNotProjected));

      expect(rows).toHaveLength(4);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(child1Id);
      expect(ids).toContain(child2Id);
      expect(ids).toContain(pendingId);
      expect(ids).toContain(postedId);
      expect(ids).not.toContain(projectedId);
    });

    it('accountVisible filtra transações de contas com isHidden = true', async () => {
      const rows = await db
        .select({ id: transactions.id })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .where(and(inArray(transactions.accountId, [accId, hiddenAccId]), txLive, accountVisible));

      expect(rows).toHaveLength(5);
      expect(rows.every((r) => r.id !== deletedId && r.id !== motherId)).toBe(true);
    });

    it('accountInTotals filtra transações de contas com includeInTotals = false', async () => {
      const rows = await db
        .select({ id: transactions.id })
        .from(transactions)
        .innerJoin(accounts, eq(accounts.id, transactions.accountId))
        .where(and(inArray(transactions.accountId, [accId, notInTotalsAccId]), txLive, accountInTotals));

      expect(rows).toHaveLength(5);
    });
  });

  describe('testes de regressão dos 3 bugs registrados', () => {
    it('globalSearch não devolve a mãe dividida', async () => {
      const res = await globalSearch(db, 'Mercado');
      const foundMother = res.transactions.some((t) => t.id === motherId);
      expect(foundMother).toBe(false);
    });

    it('getReviewCount não conta a mãe dividida', async () => {
      // motherId tem needsReview = true, mas por ser mãe de divisão ativa, não deve ser contada
      const count = await getReviewCount(db);
      expect(count).toBe(0);
    });

    it('getInvoiceItems não lista a mãe dividida', async () => {
      const items = await getInvoiceItems(db, invoiceId);
      const ids = items.map((i) => i.id);
      expect(ids).not.toContain(motherId);
      expect(ids).toContain(child1Id);
      expect(ids).toContain(child2Id);
    });
  });
});
