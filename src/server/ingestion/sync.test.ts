import { eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import sampleChecking from '../../../tests/fixtures/pluggy/sample-checking.json';
import sampleCredit from '../../../tests/fixtures/pluggy/sample-credit.json';
import { createTestDb } from '../../../tests/helpers/db';
import { updateTransaction } from '../commands';
import { accounts, cards, connections, syncRuns, transactions, transactionSources } from '../db/schema';
import { seedBase } from '../db/seed';
import { runPipeline } from './pipeline';
import { createPluggyAdapter } from './pluggy/adapter';
import type { PluggyAccount, PluggyApi, PluggyItem, PluggyTransaction } from './pluggy/api';
import { createFakePluggyApi } from './pluggy/fake';
import { syncConnection } from './sync';

const checkingAccount = sampleChecking.account as PluggyAccount;
const creditAccount = sampleCredit.account as PluggyAccount;
const checkingTxs = sampleChecking.transactions as PluggyTransaction[];
const creditTxs = sampleCredit.transactions as PluggyTransaction[];

const baseItem: PluggyItem = {
  id: 'item-1',
  status: 'UPDATED',
  connector: { id: 201, name: 'Nu Pagamentos S.A.' },
};

async function setupSyncDb() {
  const db = await createTestDb();
  await seedBase(db);
  const [conn] = await db
    .insert(connections)
    .values({
      provider: 'pluggy',
      externalId: 'item-1',
      status: 'active',
    })
    .returning();
  return { db, connectionId: conn!.id };
}

describe('syncConnection (A1-03)', () => {
  it('primeira sincronização cria contas, cartões e transações; sync_runs com success', async () => {
    const { db, connectionId } = await setupSyncDb();
    const api = createFakePluggyApi({
      items: [baseItem],
      accounts: [checkingAccount, creditAccount],
      transactions: [...checkingTxs, ...creditTxs],
      bills: [{ id: 'bill-1', dueDate: '2026-10-27', totalAmount: 850.75 }],
    });

    const result = await syncConnection(db, connectionId, {
      adapter: createPluggyAdapter(api),
      today: '2026-10-20',
    });

    expect(result.status).toBe('success');
    expect(result.stats.accounts).toBe(2);
    expect(result.stats.created).toBe(checkingTxs.length + creditTxs.length);
    expect(result.stats.updated).toBe(0);
    expect(result.stats.deleted).toBe(0);

    const accRows = await db.select().from(accounts);
    expect(accRows).toHaveLength(2);

    const cardRows = await db.select().from(cards);
    expect(cardRows).toHaveLength(1);
    expect(cardRows[0]!.last4).toBe('7890');

    const txRows = await db.select().from(transactions);
    expect(txRows).toHaveLength(checkingTxs.length + creditTxs.length);

    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, result.syncRunId));
    expect(run!.status).toBe('success');
    expect(run!.finishedAt).not.toBeNull();

    const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
    expect(conn!.status).toBe('active');
    expect(conn!.lastSyncedAt).not.toBeNull();
    expect(conn!.lastError).toBeNull();
  });

  it('idempotência: sincronizar 2 vezes seguidas mantém a mesma contagem de transações e de transaction_sources', async () => {
    const { db, connectionId } = await setupSyncDb();
    const api = createFakePluggyApi({
      items: [baseItem],
      accounts: [checkingAccount, creditAccount],
      transactions: [...checkingTxs, ...creditTxs],
    });
    const adapter = createPluggyAdapter(api);

    await syncConnection(db, connectionId, { adapter, today: '2026-10-12' });
    const countTx1 = (await db.select().from(transactions)).length;
    const countSrc1 = (await db.select().from(transactionSources)).length;

    const second = await syncConnection(db, connectionId, { adapter, today: '2026-10-12' });
    expect(second.status).toBe('success');
    expect(second.stats.created).toBe(0);
    expect(second.stats.updated).toBe(0);

    const countTx2 = (await db.select().from(transactions)).length;
    const countSrc2 = (await db.select().from(transactionSources)).length;
    expect(countTx2).toBe(countTx1);
    expect(countSrc2).toBe(countSrc1);
  });

  it('R9: preserva descrição editada pelo usuário e atualiza o valor não editado', async () => {
    const { db, connectionId } = await setupSyncDb();
    const txOrig: PluggyTransaction = {
      ...checkingTxs[0]!,
      date: '2026-10-18T12:00:00.000Z',
    };
    const api1 = createFakePluggyApi({
      items: [baseItem],
      accounts: [checkingAccount],
      transactions: [txOrig],
    });

    await syncConnection(db, connectionId, {
      adapter: createPluggyAdapter(api1),
      today: '2026-10-20',
    });

    const [saved] = await db.select().from(transactions);
    await updateTransaction(db, {
      transactionId: saved!.id,
      patch: { description: 'Transferência para João (aluguel)' },
    });

    // Na fonte, tanto a descrição quanto o valor mudam
    const api2 = createFakePluggyApi({
      items: [baseItem],
      accounts: [checkingAccount],
      transactions: [
        {
          ...txOrig,
          description: 'PIX TRANSF OUTRO NOME',
          amount: 210.5,
        },
      ],
    });

    const res2 = await syncConnection(db, connectionId, {
      adapter: createPluggyAdapter(api2),
      today: '2026-10-20',
    });
    expect(res2.status).toBe('success');
    expect(res2.stats.updated).toBe(1);

    const [after] = await db.select().from(transactions).where(eq(transactions.id, saved!.id));
    expect(after!.description).toBe('Transferência para João (aluguel)');
    expect(after!.amountCents).toBe(-21050);
  });

  it('pendente que some na sincronização seguinte sofre soft delete', async () => {
    const { db, connectionId } = await setupSyncDb();
    const pendingTx: PluggyTransaction = {
      id: 'tx-pending-temp',
      accountId: checkingAccount.id,
      date: '2026-10-18T12:00:00.000Z',
      description: 'COMPRA PENDENTE MERCADO',
      amount: 80,
      type: 'DEBIT',
      status: 'PENDING',
    };
    const postedReplacement: PluggyTransaction = {
      id: 'tx-posted-final',
      accountId: checkingAccount.id,
      date: '2026-10-19T12:00:00.000Z',
      description: 'COMPRA MERCADO CONFIRMADA',
      amount: 80,
      type: 'DEBIT',
      status: 'POSTED',
    };

    const api1 = createFakePluggyApi({
      items: [baseItem],
      accounts: [checkingAccount],
      transactions: [checkingTxs[0]!, pendingTx],
    });
    await syncConnection(db, connectionId, {
      adapter: createPluggyAdapter(api1),
      today: '2026-10-20',
    });

    // Segunda sincronização: pendente sumiu e veio o lançado com outro id
    const api2 = createFakePluggyApi({
      items: [baseItem],
      accounts: [checkingAccount],
      transactions: [checkingTxs[0]!, postedReplacement],
    });
    const res2 = await syncConnection(db, connectionId, {
      adapter: createPluggyAdapter(api2),
      today: '2026-10-20',
    });

    expect(res2.status).toBe('success');
    expect(res2.stats.deleted).toBe(1);
    expect(res2.stats.created).toBe(1);

    const activeRows = await db.select().from(transactions).where(isNull(transactions.deletedAt));
    expect(activeRows).toHaveLength(2);
    expect(activeRows.map((r) => r.status)).not.toContain('pending');

    const allRows = await db.select().from(transactions);
    const softDeleted = allRows.find((r) => r.status === 'pending');
    expect(softDeleted?.deletedAt).not.toBeNull();
  });

  it('erro no adapter marca sync_runs e conexão com error sem lançar exceção', async () => {
    const { db, connectionId } = await setupSyncDb();
    const failingApi: PluggyApi = {
      ...createFakePluggyApi(),
      async fetchAccounts() {
        throw new Error('Falha de comunicação com Pluggy');
      },
    };

    const result = await syncConnection(db, connectionId, {
      adapter: createPluggyAdapter(failingApi),
      today: '2026-10-20',
    });

    expect(result.status).toBe('error');
    expect(result.error).toContain('Falha de comunicação com Pluggy');

    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, result.syncRunId));
    expect(run!.status).toBe('error');
    expect(run!.error).toContain('Falha de comunicação com Pluggy');

    const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId));
    expect(conn!.status).toBe('error');
    expect(conn!.lastError).toContain('Falha de comunicação com Pluggy');
  });

  it('passo de pipeline que lança erro registra no stats mas não impede o success', async () => {
    const { db, connectionId } = await setupSyncDb();
    const ctx = {
      db,
      transactionIds: [],
      accountIds: [],
      connectionId,
      stats: {} as Record<string, number>,
    };

    let nextStepRan = false;
    await runPipeline(ctx, [
      {
        name: 'failing-step',
        async run() {
          throw new Error('Erro simulado no passo');
        },
      },
      {
        name: 'ok-step',
        async run() {
          nextStepRan = true;
        },
      },
    ]);

    expect(ctx.stats['error:failing-step']).toBe(1);
    expect(nextStepRan).toBe(true);
  });
});
