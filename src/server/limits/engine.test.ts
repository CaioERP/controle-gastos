import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  categories,
  connections,
  institutions,
  invoices,
  notifications,
  spendingLimitDispatches,
  spendingLimits,
  transactions,
} from '../db/schema';
import { seedBase } from '../db/seed';
import {
  buildLimitActionUrl,
  evaluateLimitsEngine,
  evaluateSystemAlerts,
  getLimitPeriodRange,
  getLimitSpent,
} from './engine';

describe('limits engine (A4-02)', () => {
  it('calcula períodos monthly, weekly e yearly no fuso SP', () => {
    const monthly = getLimitPeriodRange('monthly', '2026-10-21');
    expect(monthly.from).toBe('2026-10-01');
    expect(monthly.to).toBe('2026-10-31');
    expect(monthly.periodKey).toBe('2026-10');

    const yearly = getLimitPeriodRange('yearly', '2026-10-21');
    expect(yearly.from).toBe('2026-01-01');
    expect(yearly.to).toBe('2026-12-31');
    expect(yearly.periodKey).toBe('2026');

    // 21/10/2026 é quarta-feira; a semana vai de 19/10 (segunda) a 25/10 (domingo)
    const weekly = getLimitPeriodRange('weekly', '2026-10-21');
    expect(weekly.from).toBe('2026-10-19');
    expect(weekly.to).toBe('2026-10-25');
    expect(weekly.periodKey).toBe('2026-W43');
  });

  it('monta actionUrl correta para /transacoes', () => {
    const urlMonthly = buildLimitActionUrl({
      from: '2026-10-01',
      to: '2026-10-31',
      categoryId: '11111111-1111-1111-1111-111111111111',
    });
    expect(urlMonthly).toContain('/transacoes?');
    expect(urlMonthly).toContain('mes=2026-10');
    expect(urlMonthly).toContain('cat=11111111-1111-1111-1111-111111111111');

    const urlCustom = buildLimitActionUrl({
      from: '2026-10-19',
      to: '2026-10-25',
      paymentMethod: 'pix',
    });
    expect(urlCustom).toContain('de=2026-10-19');
    expect(urlCustom).toContain('ate=2026-10-25');
    expect(urlCustom).toContain('forma=pix');
  });

  it('calcula gasto efetivo com herança pai/filha e abatimento de estornos (R2)', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Conta Teste',
        type: 'checking',
        balanceCents: 100000,
      })
      .returning();

    // Cria categoria pai "Alimentação" e filha "Delivery"
    const [parentCat] = await db
      .insert(categories)
      .values({
        name: 'Alimentação Teste',
        slug: 'alimentacao-teste',
        kind: 'expense',
        icon: 'utensils',
        color: '#FF0000',
      })
      .returning();

    const [childCat] = await db
      .insert(categories)
      .values({
        parentId: parentCat!.id,
        name: 'Delivery Teste',
        slug: 'delivery-teste',
        kind: 'expense',
        icon: 'bike',
        color: '#FF5500',
      })
      .returning();

    // Despesa na categoria filha: R$ 150,00
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-10-10',
      amountCents: -15000,
      currency: 'BRL',
      descriptionRaw: 'iFood',
      description: 'iFood',
      kind: 'expense',
      paymentMethod: 'pix',
      status: 'posted',
      categoryId: childCat!.id,
    });

    // Despesa na categoria pai: R$ 200,00
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-10-12',
      amountCents: -20000,
      currency: 'BRL',
      descriptionRaw: 'Mercado',
      description: 'Mercado',
      kind: 'expense',
      paymentMethod: 'debit_card',
      status: 'posted',
      categoryId: parentCat!.id,
    });

    // Estorno na categoria filha: R$ 30,00
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-10-15',
      amountCents: 3000, // R1/R2: positivo = entrada
      currency: 'BRL',
      descriptionRaw: 'Estorno iFood',
      description: 'Estorno iFood',
      kind: 'refund',
      paymentMethod: 'pix',
      status: 'posted',
      categoryId: childCat!.id,
    });

    // Gasto no limite da categoria filha: 150 - 30 = R$ 120,00 (12000 centavos)
    const childSpent = await getLimitSpent(
      db,
      { categoryId: childCat!.id },
      { from: '2026-10-01', to: '2026-10-31' },
    );
    expect(childSpent).toBe(12000);

    // Gasto no limite da categoria pai (deve herdar as filhas automaticamente):
    // 200 (pai) + 120 (filha líquida) = R$ 320,00 (32000 centavos)
    const parentSpent = await getLimitSpent(
      db,
      { categoryId: parentCat!.id },
      { from: '2026-10-01', to: '2026-10-31' },
    );
    expect(parentSpent).toBe(32000);
  });

  it('atende aos critérios de aceite de disparos de limiares (80%, 100%) e idempotência estrita', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Conta Teste',
        type: 'checking',
        balanceCents: 100000,
      })
      .returning();

    const [deliveryCat] = await db
      .insert(categories)
      .values({
        name: 'Delivery Especial',
        slug: 'delivery-especial',
        kind: 'expense',
        icon: 'bike',
        color: '#FFAA00',
      })
      .returning();

    // Limite Delivery de R$ 400 (40000 centavos)
    const [limit] = await db
      .insert(spendingLimits)
      .values({
        name: 'Delivery',
        categoryId: deliveryCat!.id,
        amountCents: 40000,
        period: 'monthly',
        thresholds: [80, 100],
        notifyPace: false,
        isActive: true,
      })
      .returning();

    // 1. R$ 330 já gastos (82.5%) -> gera notificação de 80%
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-10-05',
      amountCents: -33000,
      currency: 'BRL',
      descriptionRaw: 'Lanches 1',
      description: 'Lanches 1',
      kind: 'expense',
      paymentMethod: 'pix',
      status: 'posted',
      categoryId: deliveryCat!.id,
    });

    const res1 = await evaluateLimitsEngine(db, { today: '2026-10-10' });
    expect(res1.evaluatedLimits).toBe(1);
    expect(res1.newNotifications).toBe(1);

    const dispatches1 = await db
      .select()
      .from(spendingLimitDispatches)
      .where(eq(spendingLimitDispatches.limitId, limit!.id));
    expect(dispatches1).toHaveLength(1);
    expect(dispatches1[0]!.threshold).toBe(80);

    const notifs1 = await db.select().from(notifications);
    expect(notifs1).toHaveLength(1);
    expect(notifs1[0]!.type).toBe('threshold_80');
    expect(notifs1[0]!.title).toContain('80%');
    expect(notifs1[0]!.message).toContain('330,00');

    // 2. Reavaliar não duplica (idempotência)
    const resIdempotent = await evaluateLimitsEngine(db, { today: '2026-10-10' });
    expect(resIdempotent.newNotifications).toBe(0);

    // 3. Uma despesa de R$ 10 eleva o total para R$ 340 (85%):
    // Como 80% já disparou e ainda não atingiu 100%, nenhuma nova notificação é criada
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-10-12',
      amountCents: -1000,
      currency: 'BRL',
      descriptionRaw: 'Bebida',
      description: 'Bebida',
      kind: 'expense',
      paymentMethod: 'pix',
      status: 'posted',
      categoryId: deliveryCat!.id,
    });

    const res2 = await evaluateLimitsEngine(db, { today: '2026-10-12' });
    expect(res2.newNotifications).toBe(0);

    // 4. Uma despesa seguinte de R$ 70 eleva o total para R$ 410 (102.5%):
    // Gera notificação de 100% (threshold_100)
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-10-15',
      amountCents: -7000,
      currency: 'BRL',
      descriptionRaw: 'Jantar',
      description: 'Jantar',
      kind: 'expense',
      paymentMethod: 'pix',
      status: 'posted',
      categoryId: deliveryCat!.id,
    });

    const res3 = await evaluateLimitsEngine(db, { today: '2026-10-15' });
    expect(res3.newNotifications).toBe(1);

    const notifs3 = await db.select().from(notifications);
    expect(notifs3).toHaveLength(2);
    const notif100 = notifs3.find((n) => n.type === 'threshold_100');
    expect(notif100).toBeDefined();
    expect(notif100!.title).toContain('Limite atingido');
    expect(notif100!.message).toContain('410,00');

    // 5. No mês seguinte ('2026-11'), com gasto novo, limiares voltam a ser avaliados normalmente
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-11-05',
      amountCents: -35000, // R$ 350 (87.5%)
      currency: 'BRL',
      descriptionRaw: 'Almoço Novembro',
      description: 'Almoço Novembro',
      kind: 'expense',
      paymentMethod: 'pix',
      status: 'posted',
      categoryId: deliveryCat!.id,
    });

    const resNov = await evaluateLimitsEngine(db, { today: '2026-11-06' });
    expect(resNov.newNotifications).toBe(1);
    const dispatchesNov = await db
      .select()
      .from(spendingLimitDispatches)
      .where(eq(spendingLimitDispatches.periodKey, '2026-11'));
    expect(dispatchesNov).toHaveLength(1);
    expect(dispatchesNov[0]!.threshold).toBe(80);
  });

  it('dispara alerta de ritmo (pace_warning) quando projeção estoura o teto antes do fim', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Conta Teste',
        type: 'checking',
        balanceCents: 100000,
      })
      .returning();

    const [cat] = await db
      .insert(categories)
      .values({
        name: 'Lazer',
        slug: 'lazer-ritmo',
        kind: 'expense',
        icon: 'film',
        color: '#00AAFF',
      })
      .returning();

    // Limite de R$ 1.000 / mês (100000 centavos)
    const [limit] = await db
      .insert(spendingLimits)
      .values({
        name: 'Lazer',
        categoryId: cat!.id,
        amountCents: 100000,
        period: 'monthly',
        thresholds: [80, 100],
        notifyPace: true,
        isActive: true,
      })
      .returning();

    // No dia 10 de outubro (d = 10, D = 31 dias, p = 10/31 ≈ 0.32 >= 0.25):
    // Gasto acumulado de R$ 500 (50000 centavos, 50% do limite).
    // Projeção: (50000 / 10) * 31 = 155.000 > 100.000.
    // Dia de estouro: ceil(100.000 * 10 / 50.000) = 20 <= 31.
    await db.insert(transactions).values({
      accountId: acc!.id,
      date: '2026-10-08',
      amountCents: -50000,
      currency: 'BRL',
      descriptionRaw: 'Cinema e Passeio',
      description: 'Cinema e Passeio',
      kind: 'expense',
      paymentMethod: 'pix',
      status: 'posted',
      categoryId: cat!.id,
    });

    const res = await evaluateLimitsEngine(db, { today: '2026-10-10' });
    expect(res.newNotifications).toBe(1);

    const notifs = await db.select().from(notifications);
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.type).toBe('pace_warning');
    expect(notifs[0]!.title).toContain('Ritmo acelerado em Lazer');
    expect(notifs[0]!.message).toContain('10 dias');

    // Confere despacho com threshold -1
    const [paceDispatch] = await db
      .select()
      .from(spendingLimitDispatches)
      .where(eq(spendingLimitDispatches.limitId, limit!.id));
    expect(paceDispatch).toBeDefined();
    expect(paceDispatch!.threshold).toBe(-1);

    // Idempotência
    const res2 = await evaluateLimitsEngine(db, { today: '2026-10-11' });
    expect(res2.newNotifications).toBe(0);
  });

  it('avalia alertas de sistema: fatura vencendo, consentimento expirando e gasto fora do padrão', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        institutionId: inst!.id,
        name: 'Cartão Teste',
        type: 'credit_card',
        balanceCents: 0,
      })
      .returning();

    // 1. Fatura vencendo em 3 dias (hoje: 2026-10-10, vencimento: 2026-10-13)
    await db.insert(invoices).values({
      accountId: acc!.id,
      referenceMonth: '2026-10-01',
      closingDate: '2026-10-06',
      dueDate: '2026-10-13',
      totalCents: 45000,
      status: 'closed',
    });

    // 2. Conexão com consentimento expirando em 10 dias (< 15 dias)
    await db.insert(connections).values({
      provider: 'pluggy',
      institutionId: inst!.id,
      externalId: 'conn-alert-1',
      status: 'active',
      consentExpiresAt: new Date('2026-10-20T12:00:00Z'),
    });

    // 3. Gasto fora do padrão:
    // Categoria com 5 despesas anteriores com média de R$ 50,00 e desvio baixo
    const [cat] = await db
      .insert(categories)
      .values({
        name: 'Café da Manhã',
        slug: 'cafe-teste',
        kind: 'expense',
        icon: 'coffee',
        color: '#773300',
      })
      .returning();

    for (let i = 1; i <= 5; i++) {
      await db.insert(transactions).values({
        accountId: acc!.id,
        date: `2026-09-0${i}`,
        amountCents: -5000, // R$ 50
        currency: 'BRL',
        descriptionRaw: 'Padaria',
        description: 'Padaria',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
        categoryId: cat!.id,
      });
    }

    // Transação anormal recente de R$ 500,00 (50000 centavos >= 10000 e > 50 + 2*0)
    const [unusualTx] = await db
      .insert(transactions)
      .values({
        accountId: acc!.id,
        date: '2026-10-09',
        amountCents: -50000,
        currency: 'BRL',
        descriptionRaw: 'Banquete de Luxo',
        description: 'Banquete de Luxo',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
        categoryId: cat!.id,
      })
      .returning();

    const notifsCount = await evaluateSystemAlerts(db, {
      today: '2026-10-10',
      transactionIds: [unusualTx!.id],
    });
    expect(notifsCount).toBe(3);

    const allNotifs = await db.select().from(notifications);
    const types = allNotifs.map((n) => n.type);
    expect(types).toContain('invoice_due_soon');
    expect(types).toContain('consent_expiring');
    expect(types).toContain('unusual_expense');
  });
});
