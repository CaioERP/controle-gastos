import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import {
  accounts,
  connections,
  invoices,
  syncRuns,
  transactions,
  transactionSources,
} from '@/server/db/schema';
import { addDaysISO, today as getToday, TZ } from '@/server/domain/dates';
import { resolveInstitution } from './institutions';
import { computeInvoiceStatus } from './invoices';
import { upsertAccount, upsertTransaction } from './persist';
import { runPipeline } from './pipeline';
import type { RawInvoice, SourceAdapter } from './types';

export type SyncResult = {
  syncRunId: string;
  status: 'success' | 'error';
  stats: Record<string, number>;
  error?: string;
};

function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(
    /(?:Bearer\s+|api[_-]?key[=:\s]+|client[_-]?secret[=:\s]+|secret[=:\s]+|password[=:\s]+|token[=:\s]+)[^\s,;]+/gi,
    '[REDACTED]',
  );
}

async function accountHasTransactions(
  db: Db,
  connectionId: string,
  accountExternalId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(and(eq(accounts.connectionId, connectionId), eq(accounts.externalId, accountExternalId)))
    .limit(1);
  return row !== undefined;
}

/**
 * Desfaz a quitação registrada por um pagamento apagado (classify-kind grava paidAt = data e
 * paidAmountCents = valor). Só mexe se nenhum outro pagamento ativo com a mesma data e valor explica
 * a quitação. Não dá para restringir à conexão: pagar o cartão de um banco com a conta de outro é comum.
 */
async function unpayInvoicePaidBy(db: Db, date: string, amountCents: number, todayStr: string) {
  const [otherPayer] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.kind, 'invoice_payment'),
        eq(transactions.date, date),
        eq(transactions.amountCents, -amountCents),
        isNull(transactions.deletedAt),
        ne(accounts.type, 'credit_card'),
      ),
    )
    .limit(1);
  if (otherPayer) return;

  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.paidAt, date), eq(invoices.paidAmountCents, amountCents)))
    .orderBy(asc(invoices.id))
    .limit(1);
  if (!inv) return;
  await db
    .update(invoices)
    .set({
      paidAt: null,
      paidAmountCents: null,
      status: computeInvoiceStatus({ closingDate: inv.closingDate, dueDate: inv.dueDate, paidAt: null }, todayStr),
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, inv.id));
}

export async function syncConnection(
  db: Db,
  connectionId: string,
  deps: { adapter: SourceAdapter; today?: string },
): Promise<SyncResult> {
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));

  const [run] = await db
    .insert(syncRuns)
    .values({
      connectionId: conn ? conn.id : null,
      job: 'pluggy-sync',
      status: 'running',
      stats: {},
    })
    .returning({ id: syncRuns.id });

  const syncRunId = run!.id;
  const stats: Record<string, number> = {
    accounts: 0,
    created: 0,
    updated: 0,
    deleted: 0,
  };

  if (!conn) {
    const error = 'Conexão não encontrada';
    await db
      .update(syncRuns)
      .set({ status: 'error', finishedAt: new Date(), stats, error })
      .where(eq(syncRuns.id, syncRunId));
    return { syncRunId, status: 'error', stats, error };
  }

  await db
    .update(connections)
    .set({ status: 'syncing', updatedAt: new Date() })
    .where(eq(connections.id, conn.id));

  const todayStr = deps.today ?? getToday();
  const fullSince = addDaysISO(todayStr, -365);
  const incrementalSince = conn.lastSyncedAt
    ? addDaysISO(format(new TZDate(conn.lastSyncedAt, TZ), 'yyyy-MM-dd'), -7)
    : fullSince;

  const transactionIds: string[] = [];
  const accountIds: string[] = [];
  const invoicesByAccount: Record<string, RawInvoice[]> = {};

  try {
    const connRef = { id: conn.id, externalId: conn.externalId };
    const rawAccounts = await deps.adapter.listAccounts(connRef);

    for (const rawAccount of rawAccounts) {
      // Conta nova (ou ainda sem lançamentos — o Pluggy pode estar coletando) busca o histórico
      // completo; senão a janela incremental de 7 dias perderia o passado dela.
      const since = (await accountHasTransactions(db, conn.id, rawAccount.externalId))
        ? incrementalSince
        : fullSince;
      const normalizedTxs = await deps.adapter.listTransactions(connRef, rawAccount, since);

      let rawInvoices: RawInvoice[] | undefined;
      if (rawAccount.type === 'credit_card' && deps.adapter.listInvoices) {
        rawInvoices = await deps.adapter.listInvoices(connRef, rawAccount);
        stats.invoicesFetched = (stats.invoicesFetched ?? 0) + rawInvoices.length;
      }

      await db.transaction(async (tx) => {
        const inst = await resolveInstitution(tx, rawAccount.institutionName);
        const accountId = await upsertAccount(tx, conn.id, rawAccount, inst.id);
        accountIds.push(accountId);
        stats.accounts = (stats.accounts ?? 0) + 1;

        if (rawInvoices) {
          invoicesByAccount[accountId] = rawInvoices;
        }

        // Pendentes que a própria sincronização apagou antes (sumiram numa busca parcial)
        const syncDeletedPending = await tx
          .select({
            id: transactions.id,
            externalId: transactionSources.externalId,
            deletedAt: transactions.deletedAt,
          })
          .from(transactions)
          .innerJoin(transactionSources, eq(transactionSources.transactionId, transactions.id))
          .where(
            and(
              eq(transactions.accountId, accountId),
              eq(transactions.status, 'pending'),
              isNotNull(transactions.deletedAt),
              eq(transactionSources.source, deps.adapter.provider),
            ),
          );

        const fetchedExternalIds = new Set<string>();
        for (const nTx of normalizedTxs) {
          fetchedExternalIds.add(nTx.externalId);
          const res = await upsertTransaction(tx, accountId, nTx);
          if (res.created) {
            stats.created = (stats.created ?? 0) + 1;
            transactionIds.push(res.id);
          } else if (res.changed) {
            stats.updated = (stats.updated ?? 0) + 1;
            transactionIds.push(res.id);
          }
        }

        // Voltaram na busca → restaura (senão ficariam escondidas para sempre, R10)
        const toRestore = syncDeletedPending.filter((r) => fetchedExternalIds.has(r.externalId));
        const restoreIds = toRestore.map((r) => r.id);
        if (restoreIds.length > 0) {
          await tx
            .update(transactions)
            .set({ deletedAt: null, updatedAt: new Date() })
            .where(inArray(transactions.id, restoreIds));
          // Partes da divisão apagadas junto com a mãe (mesmo deleted_at); não traz de volta as
          // que o usuário apagou ao desfazer a divisão
          for (const r of toRestore) {
            await tx
              .update(transactions)
              .set({ deletedAt: null, updatedAt: new Date() })
              .where(
                and(eq(transactions.parentTransactionId, r.id), eq(transactions.deletedAt, r.deletedAt!)),
              );
          }
          for (const id of restoreIds) {
            if (!transactionIds.includes(id)) transactionIds.push(id);
          }
          stats.restored = (stats.restored ?? 0) + restoreIds.length;
        }

        // Pendentes que sumiram na janela sincronizada → soft delete
        const pendingRows = await tx
          .select({
            id: transactions.id,
            externalId: transactionSources.externalId,
            kind: transactions.kind,
            date: transactions.date,
            amountCents: transactions.amountCents,
          })
          .from(transactions)
          .innerJoin(transactionSources, eq(transactionSources.transactionId, transactions.id))
          .where(
            and(
              eq(transactions.accountId, accountId),
              eq(transactions.status, 'pending'),
              gte(transactions.date, since),
              isNull(transactions.deletedAt),
              eq(transactionSources.source, deps.adapter.provider),
            ),
          );

        const disappeared = pendingRows.filter((r) => !fetchedExternalIds.has(r.externalId));
        const disappearedIds = disappeared.map((r) => r.id);

        if (disappearedIds.length > 0) {
          const deletedAt = new Date();
          await tx
            .update(transactions)
            .set({ deletedAt })
            .where(inArray(transactions.id, disappearedIds));
          // Partes de divisão da mãe apagada: senão continuam somando junto com o lançado que
          // chega com outro id (gasto em dobro)
          await tx
            .update(transactions)
            .set({ deletedAt })
            .where(and(inArray(transactions.parentTransactionId, disappearedIds), isNull(transactions.deletedAt)));
          stats.deleted = (stats.deleted ?? 0) + disappearedIds.length;

          // Pagamento de fatura pendente que sumiu (o lançado costuma vir com outro id): desfaz a
          // quitação para o lançado conseguir casar com a fatura de novo.
          for (const r of disappeared) {
            if (r.kind === 'invoice_payment' && r.amountCents < 0) {
              await unpayInvoicePaidBy(tx, r.date, -r.amountCents, todayStr);
            }
          }
        }
      });
    }

    await runPipeline({
      db,
      transactionIds,
      accountIds,
      connectionId: conn.id,
      stats,
      invoicesByAccount,
      today: todayStr,
    });

    const now = deps.today
      ? new Date(new TZDate(`${deps.today}T12:00:00`, TZ).getTime())
      : new Date();
    await db
      .update(connections)
      .set({ status: 'active', lastSyncedAt: now, lastError: null, updatedAt: now })
      .where(eq(connections.id, conn.id));

    await db
      .update(syncRuns)
      .set({ status: 'success', finishedAt: now, stats })
      .where(eq(syncRuns.id, syncRunId));

    return { syncRunId, status: 'success', stats };
  } catch (err) {
    const error = sanitizeErrorMessage(err);
    const now = new Date();

    await db
      .update(connections)
      .set({ status: 'error', lastError: error, updatedAt: now })
      .where(eq(connections.id, conn.id));

    await db
      .update(syncRuns)
      .set({ status: 'error', finishedAt: now, stats, error })
      .where(eq(syncRuns.id, syncRunId));

    return { syncRunId, status: 'error', stats, error };
  }
}
