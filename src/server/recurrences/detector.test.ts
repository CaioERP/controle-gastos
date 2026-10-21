import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import {
  accounts,
  categories,
  institutions,
  notifications,
  recurrences,
  transactions,
} from '../db/schema';
import { seedBase } from '../db/seed';
import {
  calculateAmountStats,
  calculateIntervalStats,
  evaluateCandidateGroup,
  isSubscriptionHeuristic,
  runRecurrenceDetection,
} from './detector';

describe('recurrences detector (A4-01)', () => {
  describe('calculateIntervalStats', () => {
    it('detecta intervalo mensal regular (stdDev <= 4 ou mesmo dia +- 3)', () => {
      // 10/ago, 10/set, 10/out
      const dates = ['2026-08-10', '2026-09-10', '2026-10-10'];
      const stats = calculateIntervalStats(dates);
      expect(stats.frequency).toBe('monthly');
      expect(stats.expectedDay).toBe(10);
      expect(stats.avgDays).toBeGreaterThanOrEqual(26);
      expect(stats.avgDays).toBeLessThanOrEqual(34);
    });

    it('detecta intervalo semanal (6 a 8 dias)', () => {
      const dates = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'];
      const stats = calculateIntervalStats(dates);
      expect(stats.frequency).toBe('weekly');
      expect(stats.avgDays).toBe(7);
      expect(stats.expectedDay).toBeDefined();
    });

    it('detecta intervalo anual (355 a 375 dias)', () => {
      const dates = ['2024-10-10', '2025-10-10', '2026-10-10'];
      const stats = calculateIntervalStats(dates);
      expect(stats.frequency).toBe('yearly');
      expect(stats.avgDays).toBe(365);
      expect(stats.expectedDay).toBe(10);
    });

    it('rejeita intervalos irregulares ou agrupados no mesmo mês', () => {
      const dates = ['2026-08-01', '2026-08-05', '2026-10-01'];
      const stats = calculateIntervalStats(dates);
      expect(stats.frequency).toBeNull();
    });

    it('retorna null se menos de 2 datas', () => {
      const stats = calculateIntervalStats(['2026-10-10']);
      expect(stats.frequency).toBeNull();
    });
  });

  describe('calculateAmountStats', () => {
    it('aceita valores estáveis com CV <= 0.10', () => {
      const stats = calculateAmountStats([-5590, -5590, -5590]);
      expect(stats.isStable).toBe(true);
      expect(stats.cv).toBe(0);
      expect(stats.mean).toBe(5590);
    });

    it('aceita pequenas oscilações dentro de 10%', () => {
      const stats = calculateAmountStats([-5000, -5200, -5100]);
      expect(stats.isStable).toBe(true);
      expect(stats.cv).toBeLessThanOrEqual(0.1);
    });

    it('rejeita valores com variação superior a 10%', () => {
      const stats = calculateAmountStats([-2000, -15000, -8000]);
      expect(stats.isStable).toBe(false);
      expect(stats.cv).toBeGreaterThan(0.1);
    });
  });

  describe('isSubscriptionHeuristic', () => {
    it('identifica serviços de streaming e software conhecidos', () => {
      expect(isSubscriptionHeuristic('Netflix.com')).toBe(true);
      expect(isSubscriptionHeuristic('Spotify AB')).toBe(true);
      expect(isSubscriptionHeuristic('Amazon Prime Canais')).toBe(true);
      expect(isSubscriptionHeuristic('Apple.com/bill')).toBe(true);
      expect(isSubscriptionHeuristic('Google One')).toBe(true);
      expect(isSubscriptionHeuristic('ChatGPT Subscription')).toBe(true);
    });

    it('identifica pagamento recorrente via cartão de crédito ou débito automático', () => {
      expect(
        isSubscriptionHeuristic('Academia Bairro', 'credit_card_single'),
      ).toBe(true);
      expect(isSubscriptionHeuristic('Clube do Livro', 'direct_debit')).toBe(
        true,
      );
    });

    it('não considera compras comuns em débito ou dinheiro como assinatura', () => {
      expect(isSubscriptionHeuristic('Padaria Central', 'debit_card')).toBe(
        false,
      );
      expect(isSubscriptionHeuristic('Mercado Municipal', 'cash')).toBe(false);
    });
  });

  describe('evaluateCandidateGroup', () => {
    it('retorna null para grupos com menos de 3 transações', () => {
      const result = evaluateCandidateGroup([
        {
          id: '1',
          date: '2026-08-10',
          amountCents: -5590,
          description: 'Netflix',
          merchantId: null,
          merchantName: null,
          categoryId: null,
          accountId: null,
          paymentMethod: 'credit_card_single',
        },
        {
          id: '2',
          date: '2026-09-10',
          amountCents: -5590,
          description: 'Netflix',
          merchantId: null,
          merchantName: null,
          categoryId: null,
          accountId: null,
          paymentMethod: 'credit_card_single',
        },
      ]);
      expect(result).toBeNull();
    });

    it('avalia grupo válido de 3 ocorrências mensais estáveis', () => {
      const result = evaluateCandidateGroup([
        {
          id: '1',
          date: '2026-08-10',
          amountCents: -5590,
          description: 'NETFLIX ENTRETENIMENTO',
          merchantId: null,
          merchantName: null,
          categoryId: 'cat-streaming',
          accountId: 'acc-nubank',
          paymentMethod: 'credit_card_single',
        },
        {
          id: '2',
          date: '2026-09-10',
          amountCents: -5590,
          description: 'NETFLIX ENTRETENIMENTO',
          merchantId: null,
          merchantName: null,
          categoryId: 'cat-streaming',
          accountId: 'acc-nubank',
          paymentMethod: 'credit_card_single',
        },
        {
          id: '3',
          date: '2026-10-10',
          amountCents: -5590,
          description: 'NETFLIX ENTRETENIMENTO',
          merchantId: null,
          merchantName: null,
          categoryId: 'cat-streaming',
          accountId: 'acc-nubank',
          paymentMethod: 'credit_card_single',
        },
      ]);

      expect(result).not.toBeNull();
      expect(result?.frequency).toBe('monthly');
      expect(result?.expectedDay).toBe(10);
      expect(result?.amountCents).toBe(5590);
      expect(result?.isSubscription).toBe(true);
      expect(result?.firstDate).toBe('2026-08-10');
      expect(result?.lastDate).toBe('2026-10-10');
    });
  });

  describe('runRecurrenceDetection integração com banco', () => {
    it('detecta recorrência mensal da Netflix com 3 cobranças', async () => {
      const db = await createTestDb();
      await seedBase(db);

      const [inst] = await db.select().from(institutions).limit(1);
      const [acc] = await db
        .insert(accounts)
        .values({
          name: 'Cartão Nubank',
          type: 'credit_card',
          institutionId: inst!.id,
          currency: 'BRL',
          balanceCents: 0,
        })
        .returning();

      const [cat] = await db
        .select()
        .from(categories)
        .where(eq(categories.kind, 'expense'))
        .limit(1);

      // Insere 3 transações mensais da Netflix
      await db.insert(transactions).values([
        {
          accountId: acc!.id,
          date: '2026-08-10',
          amountCents: -5590,
          currency: 'BRL',
          descriptionRaw: 'NETFLIX.COM',
          description: 'Netflix',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
          status: 'posted',
          categoryId: cat!.id,
        },
        {
          accountId: acc!.id,
          date: '2026-09-10',
          amountCents: -5590,
          currency: 'BRL',
          descriptionRaw: 'NETFLIX.COM',
          description: 'Netflix',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
          status: 'posted',
          categoryId: cat!.id,
        },
        {
          accountId: acc!.id,
          date: '2026-10-10',
          amountCents: -5590,
          currency: 'BRL',
          descriptionRaw: 'NETFLIX.COM',
          description: 'Netflix',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
          status: 'posted',
          categoryId: cat!.id,
        },
      ]);

      const res = await runRecurrenceDetection(db, { today: '2026-10-15' });
      expect(res.detected).toBe(1);

      const [savedRec] = await db.select().from(recurrences);
      expect(savedRec).toBeDefined();
      expect(savedRec?.description).toContain('Netflix');
      expect(savedRec?.frequency).toBe('monthly');
      expect(savedRec?.amountCents).toBe(5590);
      expect(savedRec?.lastAmountCents).toBe(5590);
      expect(savedRec?.isSubscription).toBe(true);
      expect(savedRec?.status).toBe('active');
    });

    it('detecta aumento de preço (> 5%) no 4º mês e despacha notificação price_hike', async () => {
      const db = await createTestDb();
      await seedBase(db);

      const [inst] = await db.select().from(institutions).limit(1);
      const [acc] = await db
        .insert(accounts)
        .values({
          name: 'Cartão Nubank',
          type: 'credit_card',
          institutionId: inst!.id,
          currency: 'BRL',
          balanceCents: 0,
        })
        .returning();

      // Já cadastra a recorrência existente com amountCents = 5590
      const [rec] = await db
        .insert(recurrences)
        .values({
          description: 'Netflix',
          frequency: 'monthly',
          expectedDay: 10,
          amountCents: 5590,
          lastAmountCents: 5590,
          status: 'active',
          isSubscription: true,
          firstDate: '2026-07-10',
          lastDate: '2026-09-10',
          autoDetected: true,
        })
        .returning();

      // Transações anteriores + 4ª cobrança com aumento: R$ 64,90 (+16%)
      await db.insert(transactions).values([
        {
          accountId: acc!.id,
          date: '2026-07-10',
          amountCents: -5590,
          currency: 'BRL',
          descriptionRaw: 'NETFLIX',
          description: 'Netflix',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
          status: 'posted',
        },
        {
          accountId: acc!.id,
          date: '2026-08-10',
          amountCents: -5590,
          currency: 'BRL',
          descriptionRaw: 'NETFLIX',
          description: 'Netflix',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
          status: 'posted',
        },
        {
          accountId: acc!.id,
          date: '2026-09-10',
          amountCents: -5590,
          currency: 'BRL',
          descriptionRaw: 'NETFLIX',
          description: 'Netflix',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
          status: 'posted',
        },
        {
          accountId: acc!.id,
          date: '2026-10-10',
          amountCents: -6490,
          currency: 'BRL',
          descriptionRaw: 'NETFLIX',
          description: 'Netflix',
          kind: 'expense',
          paymentMethod: 'credit_card_single',
          status: 'posted',
        },
      ]);

      const res = await runRecurrenceDetection(db, { today: '2026-10-15' });
      expect(res.priceHikes).toBe(1);

      // Confere se atualizou a recorrência
      const [updatedRec] = await db
        .select()
        .from(recurrences)
        .where(eq(recurrences.id, rec!.id));
      expect(updatedRec?.lastAmountCents).toBe(6490);
      expect(updatedRec?.lastDate).toBe('2026-10-10');

      // Confere se criou a notificação de aumento
      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.type, 'price_hike'));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]?.title).toContain('Aumento detectado: Netflix');
      expect(notifs[0]?.message).toContain('subiu de');
      expect(notifs[0]?.message).toContain('+16%');
    });

    it('detecta cobrança ausente (> 10 dias de atraso) e despacha cancelled_subscription', async () => {
      const db = await createTestDb();
      await seedBase(db);

      // Recorrência ativa com última cobrança em 2026-08-05 (esperada a cada ~30 dias)
      // Em 2026-09-20 (46 dias desde a última, > 30 + 10 = 40), deve disparar alerta
      await db.insert(recurrences).values({
        description: 'Spotify',
        frequency: 'monthly',
        expectedDay: 5,
        amountCents: 2190,
        lastAmountCents: 2190,
        status: 'active',
        isSubscription: true,
        firstDate: '2026-05-05',
        lastDate: '2026-08-05',
        autoDetected: true,
      });

      const res = await runRecurrenceDetection(db, { today: '2026-09-20' });
      expect(res.cancelled).toBe(1);

      const notifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.type, 'cancelled_subscription'));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]?.title).toContain('Cobrança ausente: Spotify');
      expect(notifs[0]?.fingerprint).toContain('recurrence:');
      expect(notifs[0]?.fingerprint).toContain(':missing:2026-09');
    });

    it('ignora transações esporádicas ou com valores aleatórios', async () => {
      const db = await createTestDb();
      await seedBase(db);

      const [inst] = await db.select().from(institutions).limit(1);
      const [acc] = await db
        .insert(accounts)
        .values({
          name: 'Conta Corrente',
          type: 'checking',
          institutionId: inst!.id,
          currency: 'BRL',
          balanceCents: 0,
        })
        .returning();

      // Compras de supermercado em dias e valores aleatórios
      await db.insert(transactions).values([
        {
          accountId: acc!.id,
          date: '2026-08-03',
          amountCents: -12500,
          currency: 'BRL',
          descriptionRaw: 'SUPERMERCADO DIA',
          description: 'Supermercado Dia',
          kind: 'expense',
          paymentMethod: 'debit_card',
          status: 'posted',
        },
        {
          accountId: acc!.id,
          date: '2026-08-07',
          amountCents: -3500,
          currency: 'BRL',
          descriptionRaw: 'SUPERMERCADO DIA',
          description: 'Supermercado Dia',
          kind: 'expense',
          paymentMethod: 'debit_card',
          status: 'posted',
        },
        {
          accountId: acc!.id,
          date: '2026-09-18',
          amountCents: -24000,
          currency: 'BRL',
          descriptionRaw: 'SUPERMERCADO DIA',
          description: 'Supermercado Dia',
          kind: 'expense',
          paymentMethod: 'debit_card',
          status: 'posted',
        },
      ]);

      const res = await runRecurrenceDetection(db, { today: '2026-10-15' });
      expect(res.detected).toBe(0);
      const recs = await db.select().from(recurrences);
      expect(recs).toHaveLength(0);
    });
  });
});
