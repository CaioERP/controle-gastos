import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PAYMENT_METHODS } from '../../domain/enums';
import {
  normalizePluggyAccount,
  normalizePluggyTransaction,
} from './normalize';
import type { PluggyAccount, PluggyTransaction } from './api';

describe('pluggy normalizer', () => {
  const fixturesDir = path.resolve(__dirname, '../../../../tests/fixtures/pluggy');

  it('normaliza todas as fixtures de tests/fixtures/pluggy/ sem erro', () => {
    if (!fs.existsSync(fixturesDir)) {
      return;
    }

    const files = fs
      .readdirSync(fixturesDir)
      .filter((f) => f.endsWith('.json'));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = JSON.parse(
        fs.readFileSync(path.join(fixturesDir, file), 'utf8')
      );

      const rawAccount = normalizePluggyAccount(
        content.account as PluggyAccount,
        'Instituição Teste'
      );

      expect(rawAccount.externalId).toBe(content.account.id);
      expect(rawAccount.name).toBe(content.account.name);
      if (rawAccount.type === 'credit_card') {
        expect(rawAccount.balanceCents).toBeLessThanOrEqual(0);
      }

      let foundInstallment = false;

      for (const tx of content.transactions as PluggyTransaction[]) {
        const norm = normalizePluggyTransaction(tx, rawAccount);

        // (a) Nenhuma lança erro (implícito)
        expect(norm).toBeDefined();

        // (b) Todos os enums são válidos
        expect(PAYMENT_METHODS).toContain(norm.paymentMethod);

        // (c) Datas no formato YYYY-MM-DD
        expect(norm.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        // (d) Compras em cartão têm amountCents < 0
        if (
          rawAccount.type === 'credit_card' &&
          tx.type === 'DEBIT'
        ) {
          expect(norm.amountCents).toBeLessThan(0);
        }

        if (norm.installment) {
          foundInstallment = true;
          expect(norm.installment.number).toBeGreaterThanOrEqual(1);
          expect(norm.installment.total).toBeGreaterThanOrEqual(
            norm.installment.number
          );
        }
      }

      if (rawAccount.type === 'credit_card') {
        expect(foundInstallment).toBe(true);
      }
    }
  });

  it('caso sintético: conversão de data perto da meia-noite em São Paulo (UTC-3)', () => {
    // 2026-10-01T02:30:00.000Z em UTC corresponde a 2026-09-30 23:30 em São Paulo
    const account = normalizePluggyAccount(
      {
        id: 'acc-1',
        itemId: 'item-1',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        name: 'Conta',
        balance: 100,
      },
      'Banco Teste'
    );

    const tx: PluggyTransaction = {
      id: 'tx-midnight-1',
      accountId: 'acc-1',
      date: '2026-10-01T02:30:00.000Z',
      description: 'PADARIA REAL',
      amount: 15.0,
      type: 'DEBIT',
      status: 'POSTED',
    };

    const norm = normalizePluggyTransaction(tx, account);
    expect(norm.date).toBe('2026-09-30');
  });

  it('reconhece parcelas por creditCardMetadata e formata a descrição', () => {
    const cardAccount = normalizePluggyAccount(
      {
        id: 'acc-crd',
        itemId: 'item-1',
        type: 'CREDIT',
        name: 'Cartão',
        balance: 500,
      },
      'Nubank'
    );

    const tx: PluggyTransaction = {
      id: 'tx-meta-1',
      accountId: 'acc-crd',
      date: '2026-10-15T15:00:00.000Z',
      description: 'LOJA ELETRO',
      amount: 200.0,
      type: 'DEBIT',
      status: 'POSTED',
      creditCardMetadata: {
        installmentNumber: 3,
        totalInstallments: 10,
        totalAmount: 2000.0,
        cardNumber: '1111222233334444',
        billId: 'bill-99',
      },
    };

    const norm = normalizePluggyTransaction(tx, cardAccount);
    expect(norm.installment).toEqual({
      number: 3,
      total: 10,
      purchaseDate: null,
      totalAmountCents: 200000,
    });
    expect(norm.paymentMethod).toBe('credit_card_installment');
    expect(norm.description).toBe('Loja Eletro 3/10');
    expect(norm.cardLast4).toBe('4444');
    expect(norm.invoiceExternalId).toBe('bill-99');
  });
});
