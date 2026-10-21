import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  categories,
  institutions,
  invoices,
  recurrences,
  transactions,
} from '../db/schema';
import { seedBase } from '../db/seed';
import { getCashFlowProjection } from './projection';

describe('cashflow projection (A4-03)', () => {
  it('retorna 6 pontos mensais consistentes partindo do saldo real e alarga a incerteza', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);

    // Conta corrente com saldo de R$ 10.000,00 (1.000.000 centavos)
    const [acc] = await db
      .insert(accounts)
      .values({
        name: 'Conta Principal',
        type: 'checking',
        institutionId: inst!.id,
        currency: 'BRL',
        balanceCents: 1000000,
        includeInTotals: true,
      })
      .returning();

    // Categoria de receita e categoria de despesa
    const [incomeCat] = await db
      .select()
      .from(categories)
      .where(eq(categories.kind, 'income'))
      .limit(1);
    const [expenseCat] = await db
      .select()
      .from(categories)
      .where(eq(categories.kind, 'expense'))
      .limit(1);

    // Receita recorrente: Salário R$ 5.000,00 (500.000 centavos)
    await db.insert(recurrences).values({
      description: 'Salário Mensal',
      categoryId: incomeCat!.id,
      amountCents: 500000,
      frequency: 'monthly',
      status: 'active',
      firstDate: '2026-01-05',
      lastDate: '2026-10-05',
      lastAmountCents: 500000,
    });

    // Despesa recorrente fixa: Aluguel R$ 2.000,00 (200.000 centavos)
    await db.insert(recurrences).values({
      description: 'Aluguel',
      categoryId: expenseCat!.id,
      amountCents: 200000,
      frequency: 'monthly',
      status: 'active',
      firstDate: '2026-01-10',
      lastDate: '2026-10-10',
      lastAmountCents: 200000,
    });

    // Gastos variáveis históricos nos últimos 3 meses cheios (jul/ago/set 2026):
    // 2026-07: R$ 1.000,00
    // 2026-08: R$ 1.200,00
    // 2026-09: R$ 800,00
    // Média = R$ 1.000,00 (100.000 centavos)
    await db.insert(transactions).values([
      {
        accountId: acc!.id,
        date: '2026-07-15',
        amountCents: -100000,
        currency: 'BRL',
        descriptionRaw: 'Supermercado Julho',
        description: 'Supermercado',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
      },
      {
        accountId: acc!.id,
        date: '2026-08-15',
        amountCents: -120000,
        currency: 'BRL',
        descriptionRaw: 'Supermercado Agosto',
        description: 'Supermercado',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
      },
      {
        accountId: acc!.id,
        date: '2026-09-15',
        amountCents: -80000,
        currency: 'BRL',
        descriptionRaw: 'Supermercado Setembro',
        description: 'Supermercado',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
      },
    ]);

    const projection = await getCashFlowProjection(db, {
      today: '2026-10-15',
      monthsAhead: 6,
    });

    expect(projection.currentBalanceCents).toBe(1000000);
    expect(projection.horizonMonths).toBe(6);
    expect(projection.points).toHaveLength(6);
    expect(projection.hasDeficitRisk).toBe(false);

    // Mês 1: 2026-11
    const p1 = projection.points[0]!;
    expect(p1.month).toBe('2026-11');
    expect(p1.startingBalanceCents).toBe(1000000);
    expect(p1.projectedIncomeCents).toBe(500000);
    expect(p1.fixedExpensesCents).toBe(200000);
    expect(p1.cardInstallmentsCents).toBe(0);
    expect(p1.variableExpensesCents).toBe(100000);

    // Saldo projetado do mês 1: 1.000.000 + 500.000 - 200.000 - 100.000 = 1.200.000
    expect(p1.projectedBalanceCents).toBe(1200000);
    expect(p1.lowerBandCents).toBeLessThan(p1.projectedBalanceCents);
    expect(p1.upperBandCents).toBeGreaterThan(p1.projectedBalanceCents);

    // Mês 2: 2026-12
    const p2 = projection.points[1]!;
    expect(p2.month).toBe('2026-12');
    expect(p2.startingBalanceCents).toBe(1200000);
    expect(p2.projectedBalanceCents).toBe(1400000);

    // Faixa de incerteza alarga progressivamente: largura(m) < largura(m+1)
    for (let i = 1; i < projection.points.length; i++) {
      const prevBandWidth =
        projection.points[i - 1]!.upperBandCents -
        projection.points[i - 1]!.lowerBandCents;
      const currentBandWidth =
        projection.points[i]!.upperBandCents -
        projection.points[i]!.lowerBandCents;
      expect(currentBandWidth).toBeGreaterThan(prevBandWidth);
    }
  });

  it('parcelas futuras de cartão reduzem o saldo projetado no mês correspondente', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    await db.insert(accounts).values({
      name: 'Conta Saldo',
      type: 'checking',
      institutionId: inst!.id,
      currency: 'BRL',
      balanceCents: 500000,
      includeInTotals: true,
    });

    const [cardAcc] = await db
      .insert(accounts)
      .values({
        name: 'Cartão de Crédito',
        type: 'credit_card',
        institutionId: inst!.id,
        currency: 'BRL',
        balanceCents: 0,
        includeInTotals: true,
      })
      .returning();

    // Cria fatura futura para 2026-12 com parcela projetada de R$ 3.000,00 (300.000 centavos)
    const [inv] = await db
      .insert(invoices)
      .values({
        accountId: cardAcc!.id,
        referenceMonth: '2026-12-01',
        closingDate: '2026-12-03',
        dueDate: '2026-12-10',
        status: 'open',
        totalCents: 300000,
      })
      .returning();

    await db.insert(transactions).values({
      accountId: cardAcc!.id,
      invoiceId: inv!.id,
      date: '2026-12-05',
      amountCents: -300000,
      currency: 'BRL',
      descriptionRaw: 'Notebook 2/3',
      description: 'Notebook',
      kind: 'expense',
      paymentMethod: 'credit_card_installment',
      status: 'projected',
      installmentNumber: 2,
      installmentTotal: 3,
    });

    const projection = await getCashFlowProjection(db, {
      today: '2026-10-15',
      monthsAhead: 3,
    });

    const decPoint = projection.points.find((p) => p.month === '2026-12');
    expect(decPoint).toBeDefined();
    expect(decPoint?.cardInstallmentsCents).toBe(300000);
    // Saldo em dezembro reflete a dedução das parcelas de cartão
    expect(decPoint?.projectedBalanceCents).toBe(
      decPoint!.startingBalanceCents - 300000,
    );
  });

  it('identifica hasDeficitRisk: true quando o limite inferior atinge saldo negativo', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);

    // Saldo inicial baixo: R$ 500,00 (50.000 centavos)
    const [acc] = await db
      .insert(accounts)
      .values({
        name: 'Conta Baixa',
        type: 'checking',
        institutionId: inst!.id,
        currency: 'BRL',
        balanceCents: 50000,
        includeInTotals: true,
      })
      .returning();

    // Gastos variáveis oscilantes com média alta
    await db.insert(transactions).values([
      {
        accountId: acc!.id,
        date: '2026-07-10',
        amountCents: -40000,
        currency: 'BRL',
        descriptionRaw: 'Gasto',
        description: 'Gasto',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
      },
      {
        accountId: acc!.id,
        date: '2026-08-10',
        amountCents: -150000,
        currency: 'BRL',
        descriptionRaw: 'Gasto',
        description: 'Gasto',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
      },
      {
        accountId: acc!.id,
        date: '2026-09-10',
        amountCents: -50000,
        currency: 'BRL',
        descriptionRaw: 'Gasto',
        description: 'Gasto',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
      },
    ]);

    const projection = await getCashFlowProjection(db, {
      today: '2026-10-15',
      monthsAhead: 6,
    });

    expect(projection.hasDeficitRisk).toBe(true);
    expect(projection.lowestProjectedBalanceCents).toBeLessThan(50000);
    expect(projection.lowestBalanceMonth).toBeDefined();
  });

  it('evita dupla contagem excluindo compras parceladas e despesas recorrentes do cálculo de gastos variáveis', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const [inst] = await db.select().from(institutions).limit(1);
    const [acc] = await db
      .insert(accounts)
      .values({
        name: 'Conta',
        type: 'checking',
        institutionId: inst!.id,
        currency: 'BRL',
        balanceCents: 200000,
        includeInTotals: true,
      })
      .returning();

    // Recorrência ativa de Aluguel
    await db.insert(recurrences).values({
      description: 'Aluguel',
      amountCents: 150000,
      frequency: 'monthly',
      status: 'active',
      firstDate: '2026-01-10',
      lastDate: '2026-10-10',
      lastAmountCents: 150000,
    });

    // Em agosto:
    // 1. Aluguel de R$ 1.500 (deve ser excluído do variável)
    // 2. Compra parcelada de TV 1/10 R$ 200 (deve ser excluída do variável para evitar dupla contagem com parcelas)
    // 3. Estorno de R$ 50
    // 4. Mercado de R$ 300 (gasto discricionário variável real)
    await db.insert(transactions).values([
      {
        accountId: acc!.id,
        date: '2026-08-10',
        amountCents: -150000,
        currency: 'BRL',
        descriptionRaw: 'ALUGUEL',
        description: 'Aluguel',
        kind: 'expense',
        paymentMethod: 'pix',
        status: 'posted',
      },
      {
        accountId: acc!.id,
        date: '2026-08-12',
        amountCents: -20000,
        currency: 'BRL',
        descriptionRaw: 'TV 1/10',
        description: 'TV',
        kind: 'expense',
        paymentMethod: 'credit_card_installment',
        status: 'posted',
        installmentNumber: 1,
        installmentTotal: 10,
      },
      {
        accountId: acc!.id,
        date: '2026-08-14',
        amountCents: 5000,
        currency: 'BRL',
        descriptionRaw: 'Estorno',
        description: 'Estorno',
        kind: 'refund',
        paymentMethod: 'debit_card',
        status: 'posted',
      },
      {
        accountId: acc!.id,
        date: '2026-08-15',
        amountCents: -30000,
        currency: 'BRL',
        descriptionRaw: 'Mercado',
        description: 'Mercado',
        kind: 'expense',
        paymentMethod: 'debit_card',
        status: 'posted',
      },
    ]);

    const projection = await getCashFlowProjection(db, {
      today: '2026-10-15',
      monthsAhead: 1,
    });

    // Em agosto, o gasto variável líquido deve ser apenas Mercado (30.000) - Estorno (5.000) = 25.000
    // Em julho e setembro é 0.
    // Média dos 3 meses = 25.000 / 3 = 8.333 centavos.
    const p1 = projection.points[0]!;
    expect(p1.variableExpensesCents).toBe(8333);
    expect(p1.fixedExpensesCents).toBe(150000);
  });
});
