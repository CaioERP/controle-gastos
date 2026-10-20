import { randomUUID } from 'node:crypto';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  cards,
  categories,
  connections,
  institutions,
  invoices,
  merchants,
  syncRuns,
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
    await tx.delete(merchants);
    await tx.delete(invoices);
    await tx.delete(cards);
    await tx.delete(accounts);
    await tx.delete(syncRuns);
    await tx.delete(connections);

    // 2b. Inserir conexão fictícia para a tela de conexões e saúde
    const nubankInstId = instMap.get('nubank');
    if (nubankInstId) {
      const connId = randomUUID();
      const syncDate = new Date(`${opts.referenceDate}T12:00:00Z`);
      const expiresDate = new Date(syncDate.getTime() + 90 * 86_400_000);
      await tx.insert(connections).values({
        id: connId,
        provider: 'pluggy',
        institutionId: nubankInstId,
        externalId: 'fixture-item-nubank',
        status: 'active',
        consentExpiresAt: expiresDate,
        lastSyncedAt: syncDate,
      });
      await tx.insert(syncRuns).values({
        id: randomUUID(),
        connectionId: connId,
        job: 'pluggy-sync',
        startedAt: syncDate,
        finishedAt: new Date(syncDate.getTime() + 1500),
        status: 'success',
        stats: { accounts: 2, created: 14, updated: 1 },
      });
    }

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

    // 5b. Estabelecimentos: um por merchantName, com os descriptionRaw vistos como aliases.
    // Metade (ordem alfabética, índices pares) já tem categoria padrão, simulando a memória aprendida.
    const merchantInfo = new Map<string, { aliases: Set<string>; categoryCounts: Map<string, number> }>();
    for (const t of data.transactions) {
      if (!t.merchantName) continue;
      const info = merchantInfo.get(t.merchantName) ?? { aliases: new Set<string>(), categoryCounts: new Map<string, number>() };
      info.aliases.add(t.descriptionRaw);
      if (t.categorySlug) info.categoryCounts.set(t.categorySlug, (info.categoryCounts.get(t.categorySlug) ?? 0) + 1);
      merchantInfo.set(t.merchantName, info);
    }
    const merchantMap = new Map<string, string>();
    const merchantNames = [...merchantInfo.keys()].sort((a, b) => a.localeCompare(b));
    for (const [i, name] of merchantNames.entries()) {
      const info = merchantInfo.get(name)!;
      const topSlug = [...info.categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const defaultCategoryId = i % 2 === 0 && topSlug ? catMap.get(topSlug) ?? null : null;
      const merchantId = randomUUID();
      merchantMap.set(name, merchantId);
      await tx.insert(merchants).values({
        id: merchantId,
        name,
        aliases: [...info.aliases].sort(),
        defaultCategoryId,
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
        merchantId: t.merchantName ? merchantMap.get(t.merchantName) ?? null : null,
        kind: t.kind,
        paymentMethod: t.paymentMethod,
        status: t.status,
        categoryId,
        categorySource: t.categorySource ?? 'default',
        categoryConfidence: t.categoryConfidence ?? null,
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
        // Fatura atual = a aberta de menor mês de referência (as seguintes só têm parcelas projetadas)
        const [openInv] = await tx
          .select({ totalCents: invoices.totalCents })
          .from(invoices)
          .where(and(eq(invoices.accountId, accountId), eq(invoices.status, 'open')))
          .orderBy(asc(invoices.referenceMonth))
          .limit(1);

        // Limite disponível = limite − tudo que ainda não foi pago (inclui parcelas futuras)
        const [unpaid] = await tx
          .select({ sum: sql<number>`coalesce(sum(${invoices.totalCents}), 0)` })
          .from(invoices)
          .where(and(eq(invoices.accountId, accountId), ne(invoices.status, 'paid')));

        const balance = openInv ? -openInv.totalCents : 0;
        const availableLimitCents =
          a.creditLimitCents !== undefined ? a.creditLimitCents - Number(unpaid?.sum ?? 0) : null;
        await tx
          .update(accounts)
          .set({ balanceCents: balance, availableLimitCents })
          .where(eq(accounts.id, accountId));
      }
    }
  });
}
