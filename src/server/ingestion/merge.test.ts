import { describe, expect, it } from 'vitest';
import type { Transaction } from '@/server/domain/types';
import { mergeIncoming, type ResolvedIncoming } from './merge';

function makeExisting(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    cardId: null,
    invoiceId: null,
    date: '2026-10-01',
    occurredAt: null,
    amountCents: -5000,
    currency: 'BRL',
    descriptionRaw: 'Pão de Açúcar 01',
    description: 'Pão de Açúcar',
    merchantId: null,
    providerCategoryId: null,
    kind: 'expense',
    paymentMethod: 'credit_card_single',
    status: 'posted',
    categoryId: null,
    categorySource: 'default',
    categoryConfidence: null,
    needsReview: false,
    installmentGroupId: null,
    installmentNumber: null,
    installmentTotal: null,
    transferGroupId: null,
    parentTransactionId: null,
    notes: null,
    userEditedFields: [],
    deletedAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

function makeIncoming(overrides: Partial<ResolvedIncoming> = {}): ResolvedIncoming {
  return {
    source: 'pluggy',
    externalId: 'ext-1',
    accountExternalId: 'acc-ext-1',
    date: '2026-10-01',
    amountCents: -5000,
    currency: 'BRL',
    descriptionRaw: 'Pão de Açúcar 01',
    description: 'Pão de Açúcar',
    merchantName: null,
    paymentMethod: 'credit_card_single',
    status: 'posted',
    cardLast4: null,
    invoiceExternalId: null,
    providerCategoryId: null,
    installment: null,
    raw: {},
    ...overrides,
  };
}

describe('mergeIncoming (A6-08 — R9 mesclagem única)', () => {
  it('campo editado pelo usuário não muda (R9)', () => {
    const existing = makeExisting({
      userEditedFields: ['description', 'amountCents'],
      description: 'Descrição Manual',
      amountCents: -7000,
    });
    const incoming = makeIncoming({
      description: 'Novo Texto do Banco',
      amountCents: -8000,
      status: 'pending',
    });

    const { patch, changed } = mergeIncoming(existing, incoming, 'replace');

    expect(patch.description).toBeUndefined();
    expect(patch.amountCents).toBeUndefined();
    expect(patch.status).toBe('pending');
    expect(changed).toBe(true);
  });

  it('replace atualiza descrição e valor quando não foram editados pelo usuário', () => {
    const existing = makeExisting();
    const incoming = makeIncoming({
      description: 'Mercado Novo',
      descriptionRaw: 'MERCADO NOVO 123',
      amountCents: -6000,
    });

    const { patch, changed } = mergeIncoming(existing, incoming, 'replace');

    expect(changed).toBe(true);
    expect(patch.description).toBe('Mercado Novo');
    expect(patch.descriptionRaw).toBe('MERCADO NOVO 123');
    expect(patch.amountCents).toBe(-6000);
  });

  it('fill-gaps não troca a data nem a descrição, mas preenche o cardId vazio', () => {
    const existing = makeExisting({
      date: '2026-10-01',
      description: 'Descrição Original',
      cardId: null,
    });
    const incoming = makeIncoming({
      date: '2026-10-05',
      description: 'Nova Descrição Ignorada',
      cardId: 'card-uuid-123',
    });

    const { patch, changed } = mergeIncoming(existing, incoming, 'fill-gaps');

    expect(changed).toBe(true);
    expect(patch.cardId).toBe('card-uuid-123');
    expect(patch.date).toBeUndefined();
    expect(patch.description).toBeUndefined();
  });

  it('fill-gaps preenche parcela quando vazia e ignora se editada ou já preenchida', () => {
    const existing = makeExisting({
      installmentNumber: null,
      installmentTotal: null,
    });
    const incoming = makeIncoming({
      installment: {
        number: 2,
        total: 5,
        purchaseDate: null,
        totalAmountCents: null,
      },
    });

    const { patch, changed } = mergeIncoming(existing, incoming, 'fill-gaps');
    expect(changed).toBe(true);
    expect(patch.installmentNumber).toBe(2);
    expect(patch.installmentTotal).toBe(5);

    // Se já tinha parcela
    const existingFilled = makeExisting({
      installmentNumber: 1,
      installmentTotal: 3,
    });
    const resFilled = mergeIncoming(existingFilled, incoming, 'fill-gaps');
    expect(resFilled.patch.installmentNumber).toBeUndefined();
  });

  it('occurredAt já gravado não é trocado (nas duas políticas)', () => {
    const originalTime = new Date('2026-10-01T10:00:00.000Z');
    const existing = makeExisting({ occurredAt: originalTime });
    const incoming = makeIncoming({ occurredAt: '2026-10-01T15:30:00.000Z' });

    const replaceRes = mergeIncoming(existing, incoming, 'replace');
    expect(replaceRes.patch.occurredAt).toBeUndefined();

    const fillRes = mergeIncoming(existing, incoming, 'fill-gaps');
    expect(fillRes.patch.occurredAt).toBeUndefined();

    // Quando estava nulo, preenche
    const existingNull = makeExisting({ occurredAt: null });
    const filledRes = mergeIncoming(existingNull, incoming, 'replace');
    expect(filledRes.patch.occurredAt).toEqual(new Date('2026-10-01T15:30:00.000Z'));
  });

  it('sem diferença, changed = false', () => {
    const existing = makeExisting();
    const incoming = makeIncoming();

    const { patch, changed } = mergeIncoming(existing, incoming, 'replace');

    expect(changed).toBe(false);
    expect(patch).toEqual({});
  });
});
