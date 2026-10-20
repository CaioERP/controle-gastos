import { eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import sampleChecking from '../../../tests/fixtures/pluggy/sample-checking.json';
import sampleCredit from '../../../tests/fixtures/pluggy/sample-credit.json';
import { createTestDb } from '../../../tests/helpers/db';
import { splitTransaction, updateTransaction } from '../commands';
import { accounts, cards, connections, invoices, syncRuns, transactions, transactionSources } from '../db/schema';
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
    const syncedRows = txRows.filter((t) => t.status !== 'projected');
    expect(syncedRows).toHaveLength(checkingTxs.length + creditTxs.length);

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

describe('syncConnection — regressões da revisão pós-merge', () => {
  const cardAccount: PluggyAccount = {
    id: 'acc-cc-rev',
    itemId: 'item-1',
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    name: 'Cartão',
    balance: 1500,
    creditData: { balanceCloseDate: '2026-10-03', balanceDueDate: '2026-10-10' },
  };
  const bills = [{ id: 'bill-rev', dueDate: '2026-10-10', totalAmount: 1500 }];
  // Sem "fatura" na descrição: só vira invoice_payment por casar valor e vencimento da fatura
  const boleto: PluggyTransaction = {
    id: 'tx-boleto',
    accountId: checkingAccount.id,
    date: '2026-10-10T12:00:00.000Z',
    description: 'BOLETO PAGO NU PAGAMENTOS',
    amount: -1500,
    type: 'DEBIT',
    status: 'PENDING',
    paymentData: { paymentMethod: 'BOLETO' },
  };

  async function sync(
    db: Awaited<ReturnType<typeof setupSyncDb>>['db'],
    connectionId: string,
    data: { accounts: PluggyAccount[]; transactions: PluggyTransaction[] },
    today: string,
  ) {
    const api = createFakePluggyApi({ items: [baseItem], bills, ...data });
    return syncConnection(db, connectionId, { adapter: createPluggyAdapter(api), today });
  }

  async function byExternalId(db: Awaited<ReturnType<typeof setupSyncDb>>['db'], externalId: string) {
    const [row] = await db
      .select({ tx: transactions })
      .from(transactions)
      .innerJoin(transactionSources, eq(transactionSources.transactionId, transactions.id))
      .where(eq(transactionSources.externalId, externalId));
    return row!.tx;
  }

  it('R2: pagamento de fatura continua invoice_payment quando o pendente vira lançado (mesmo id)', async () => {
    const { db, connectionId } = await setupSyncDb();
    const accs = [checkingAccount, cardAccount];
    await sync(db, connectionId, { accounts: accs, transactions: [boleto] }, '2026-10-12');
    expect((await byExternalId(db, 'tx-boleto')).kind).toBe('invoice_payment');

    await sync(db, connectionId, { accounts: accs, transactions: [{ ...boleto, status: 'POSTED' }] }, '2026-10-13');
    expect((await byExternalId(db, 'tx-boleto')).kind).toBe('invoice_payment');
  });

  it('R2: pagamento de fatura pendente que volta lançado com outro id quita a fatura de novo', async () => {
    const { db, connectionId } = await setupSyncDb();
    const accs = [checkingAccount, cardAccount];
    await sync(db, connectionId, { accounts: accs, transactions: [boleto] }, '2026-10-12');
    const posted = { ...boleto, id: 'tx-boleto-2', status: 'POSTED' as const, date: '2026-10-11T12:00:00.000Z' };
    await sync(db, connectionId, { accounts: accs, transactions: [posted] }, '2026-10-13');

    expect((await byExternalId(db, 'tx-boleto-2')).kind).toBe('invoice_payment');
    const [inv] = await db.select().from(invoices).where(eq(invoices.externalId, 'bill-rev'));
    expect(inv!.paidAt).toBe('2026-10-11');
  });

  it('pendente apagado não desfaz a quitação de fatura feita por outro pagamento ativo (outra conexão)', async () => {
    const { db, connectionId } = await setupSyncDb();
    const [conn2] = await db
      .insert(connections)
      .values({ provider: 'pluggy', externalId: 'item-2', status: 'active' })
      .returning();
    const chk2: PluggyAccount = { ...checkingAccount, id: 'acc-chk-2', itemId: 'item-2' };
    const cc2: PluggyAccount = { ...cardAccount, id: 'acc-cc-2', itemId: 'item-2' };
    const payment2: PluggyTransaction = { ...boleto, id: 'tx-pay-2', accountId: chk2.id, status: 'POSTED' };
    const api2 = createFakePluggyApi({
      items: [{ ...baseItem, id: 'item-2' }],
      accounts: [chk2, cc2],
      transactions: [payment2],
      bills,
    });
    await syncConnection(db, conn2!.id, { adapter: createPluggyAdapter(api2), today: '2026-10-12' });
    const [paid] = await db.select().from(invoices).where(eq(invoices.externalId, 'bill-rev'));
    expect(paid!.paidAt).toBe('2026-10-10');

    // Na conexão 1, um pendente de mesmo valor e data, que vira invoice_payment pela descrição, some
    const pend: PluggyTransaction = { ...boleto, id: 'tx-pend-1', description: 'PAGAMENTO FATURA CARTAO' };
    await sync(db, connectionId, { accounts: [checkingAccount], transactions: [pend] }, '2026-10-12');
    expect((await byExternalId(db, 'tx-pend-1')).kind).toBe('invoice_payment');
    await sync(db, connectionId, { accounts: [checkingAccount], transactions: [] }, '2026-10-13');

    const [after] = await db.select().from(invoices).where(eq(invoices.externalId, 'bill-rev'));
    expect(after!.paidAt).toBe('2026-10-10');
  });

  it('mãe pendente dividida que some leva as partes junto e as traz de volta quando reaparece', async () => {
    const { db, connectionId } = await setupSyncDb();
    const pend: PluggyTransaction = { ...checkingTxs[1]!, id: 'tx-mae', date: '2026-10-18T12:00:00.000Z', amount: -100, status: 'PENDING' };
    const run = (txs: PluggyTransaction[]) =>
      sync(db, connectionId, { accounts: [checkingAccount], transactions: txs }, '2026-10-20');
    await run([pend]);
    const mother = await byExternalId(db, 'tx-mae');
    const { splitIds } = await splitTransaction(db, {
      transactionId: mother.id,
      parts: [
        { amountCents: -6000, categoryId: null },
        { amountCents: -4000, categoryId: null },
      ],
    });
    const activeParts = async () =>
      (await db.select().from(transactions)).filter((t) => splitIds.includes(t.id) && t.deletedAt === null).length;

    await run([]);
    expect(await activeParts()).toBe(0);

    await run([pend]);
    expect((await byExternalId(db, 'tx-mae')).deletedAt).toBeNull();
    expect(await activeParts()).toBe(2);
  });

  it('valor de mãe dividida muda na fonte: divisão mantida e partes vão para revisão', async () => {
    const { db, connectionId } = await setupSyncDb();
    const orig: PluggyTransaction = { ...checkingTxs[1]!, id: 'tx-div', date: '2026-10-18T12:00:00.000Z', amount: -100 };
    const run = (txs: PluggyTransaction[]) =>
      sync(db, connectionId, { accounts: [checkingAccount], transactions: txs }, '2026-10-20');
    await run([orig]);
    const mother = await byExternalId(db, 'tx-div');
    const { splitIds } = await splitTransaction(db, {
      transactionId: mother.id,
      parts: [
        { amountCents: -6000, categoryId: null },
        { amountCents: -4000, categoryId: null },
      ],
    });

    await run([{ ...orig, amount: -110 }]);

    expect((await byExternalId(db, 'tx-div')).amountCents).toBe(-11000);
    const parts = (await db.select().from(transactions)).filter((t) => splitIds.includes(t.id));
    expect(parts.every((p) => p.deletedAt === null && p.needsReview)).toBe(true);
  });

  it('conta que aparece depois da primeira sincronização busca o histórico completo', async () => {
    const { db, connectionId } = await setupSyncDb();
    await sync(db, connectionId, { accounts: [], transactions: [] }, '2026-10-20');
    const old: PluggyTransaction = { ...checkingTxs[1]!, id: 'tx-antiga', date: '2026-08-01T12:00:00.000Z' };
    const res = await sync(db, connectionId, { accounts: [checkingAccount], transactions: [old] }, '2026-10-20');
    expect(res.stats.created).toBe(1);
  });

  it('R10: pendente apagado por sumir numa busca parcial é restaurado quando volta com o mesmo id', async () => {
    const { db, connectionId } = await setupSyncDb();
    const pend: PluggyTransaction = { ...checkingTxs[1]!, id: 'tx-volta', date: '2026-10-18T12:00:00.000Z', status: 'PENDING' };
    await sync(db, connectionId, { accounts: [checkingAccount], transactions: [checkingTxs[0]!, pend] }, '2026-10-20');
    await sync(db, connectionId, { accounts: [checkingAccount], transactions: [checkingTxs[0]!] }, '2026-10-20');
    expect((await byExternalId(db, 'tx-volta')).deletedAt).not.toBeNull();

    const back = { ...pend, status: 'POSTED' as const };
    await sync(db, connectionId, { accounts: [checkingAccount], transactions: [checkingTxs[0]!, back] }, '2026-10-20');
    const row = await byExternalId(db, 'tx-volta');
    expect(row.deletedAt).toBeNull();
    expect(row.status).toBe('posted');
  });
});
