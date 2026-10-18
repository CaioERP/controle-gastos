import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  cards,
  categories,
  connections,
  institutions,
  invoices,
  transactions,
  transactionSources,
  transactionTags,
} from '@/server/db/schema';
import { generateFixtures, type FixtureOptions } from './generate';

export async function loadFixtures(db: Db, opts: FixtureOptions): Promise<void> {
  const data = generateFixtures(opts);

  await db.transaction(async (tx) => {
    // 1. Mapeamento de instituições e categorias já cadastradas pelo seed
    const instRows = await tx.select({ id: institutions.id, slug: institutions.slug }).from(institutions);
    const instMap = new Map(instRows.map((r) => [r.slug, r.id]));

    const catRows = await tx.select({ id: categories.id, slug: categories.slug }).from(categories);
    const catMap = new Map(catRows.map((r) => [r.slug, r.id]));

    // 2. Apagar na ordem correta
    await tx.delete(transactionTags);
    await tx.delete(transactionSources);
    await tx.delete(transactions);
    await tx.delete(invoices);
    await tx.delete(cards);
    await tx.delete(accounts);
    await tx.delete(connections);

    // 3. Inserir contas
    const accountMap = new Map<string, string>();
    for (const a of data.accounts) {
      const instId = instMap.get(a.institutionSlug);
      if (!instId) {
        throw new Error(`Instituição com slug "${a.institutionSlug}" não encontrada no banco. Execute seedBase primeiro.`);
      }
      const accountId = randomUUID();
      accountMap.set(a.key, accountId);

      await tx.insert(accounts).values({
        id: accountId,
        institutionId: instId,
        type: a.type,
        name: a.name,
        creditLimitCents: a.creditLimitCents,
        closingDay: a.closingDay,
        dueDay: a.dueDay,
        balanceCents: 0,
      });

      // 4. Inserir cartões da conta
      if (a.cards && a.cards.length > 0) {
        for (const c of a.cards) {
          const cardId = randomUUID();
          await tx.insert(cards).values({
            id: cardId,
            accountId,
            last4: c.last4,
            holderName: 'Caio',
            isVirtual: Boolean(c.isVirtual),
          });
        }
      }
    }

    // Buscar cartões inseridos para vincular transações
    const allCards = await tx.select().from(cards);
    const cardMap = new Map<string, string>();
    for (const card of allCards) {
      cardMap.set(`${card.accountId}-${card.last4}`, card.id);
    }

    // 5. Inserir faturas
    const invoiceMap = new Map<string, string>();
    for (const inv of data.invoices) {
      const accountId = accountMap.get(inv.accountKey);
      if (!accountId) continue;

      const invoiceId = randomUUID();
      invoiceMap.set(inv.key, invoiceId);

      await tx.insert(invoices).values({
        id: invoiceId,
        accountId,
        referenceMonth: inv.referenceMonth,
        closingDate: inv.closingDate,
        dueDate: inv.dueDate,
        totalCents: inv.totalCents,
        status: inv.status,
      });
    }

    // 6. Inserir transações e transaction_sources
    const transferGroupMap = new Map<string, string>();
    const installmentGroupMap = new Map<string, string>();

    for (const [index, t] of data.transactions.entries()) {
      const accountId = accountMap.get(t.accountKey);
      if (!accountId) {
        throw new Error(`Conta "${t.accountKey}" não encontrada no mapa.`);
      }

      const txId = randomUUID();
      let cardId: string | null = null;
      if (t.cardLast4) {
        cardId = cardMap.get(`${accountId}-${t.cardLast4}`) ?? null;
      }

      const invoiceId = t.invoiceKey ? invoiceMap.get(t.invoiceKey) ?? null : null;
      const categoryId = t.categorySlug ? catMap.get(t.categorySlug) ?? null : null;

      let transferGroupId: string | null = null;
      if (t.transferKey) {
        if (!transferGroupMap.has(t.transferKey)) {
          transferGroupMap.set(t.transferKey, randomUUID());
        }
        transferGroupId = transferGroupMap.get(t.transferKey)!;
      }

      let installmentGroupId: string | null = null;
      if (t.installment) {
        if (!installmentGroupMap.has(t.installment.groupKey)) {
          installmentGroupMap.set(t.installment.groupKey, randomUUID());
        }
        installmentGroupId = installmentGroupMap.get(t.installment.groupKey)!;
      }

      await tx.insert(transactions).values({
        id: txId,
        accountId,
        cardId,
        invoiceId,
        date: t.date,
        amountCents: t.amountCents,
        currency: 'BRL',
        descriptionRaw: t.descriptionRaw,
        description: t.description,
        kind: t.kind,
        paymentMethod: t.paymentMethod,
        status: t.status,
        categoryId,
        categorySource: 'default',
        needsReview: t.needsReview,
        installmentGroupId,
        installmentNumber: t.installment?.number ?? null,
        installmentTotal: t.installment?.total ?? null,
        transferGroupId,
      });

      await tx.insert(transactionSources).values({
        id: randomUUID(),
        transactionId: txId,
        source: 'manual',
        externalId: `fixture-${index + 1}`,
        fetchedAt: new Date(),
      });
    }

    // 7. Atualizar saldos das contas
    for (const a of data.accounts) {
      const accountId = accountMap.get(a.key)!;
      if (a.type === 'checking') {
        const [res] = await tx
          .select({ sum: sql<number>`coalesce(sum(${transactions.amountCents}), 0)` })
          .from(transactions)
          .where(and(eq(transactions.accountId, accountId), eq(transactions.status, 'posted')));

        await tx
          .update(accounts)
          .set({ balanceCents: Number(res?.sum ?? 0) })
          .where(eq(accounts.id, accountId));
      } else if (a.type === 'credit_card') {
        const [openInv] = await tx
          .select({ totalCents: invoices.totalCents })
          .from(invoices)
          .where(and(eq(invoices.accountId, accountId), eq(invoices.status, 'open')))
          .orderBy(desc(invoices.referenceMonth))
          .limit(1);

        const balance = openInv ? -openInv.totalCents : 0;
        await tx
          .update(accounts)
          .set({ balanceCents: balance })
          .where(eq(accounts.id, accountId));
      }
    }
  });
}
