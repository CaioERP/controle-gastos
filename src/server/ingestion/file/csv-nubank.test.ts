import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNubankCsv } from './csv-nubank';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'files');

describe('parseNubankCsv (A2-01)', () => {
  const accountId = '22222222-2222-4222-8222-222222222222';

  it('parseia nubank-conta.csv mantendo sinal original e diferenciando lançamentos idênticos no mesmo dia', () => {
    const content = readFileSync(join(fixturesDir, 'nubank-conta.csv'), 'utf-8');
    const res = parseNubankCsv(content, { id: accountId, type: 'checking' });

    expect(res.format).toBe('csv_nubank_checking');
    expect(res.transactions).toHaveLength(3);

    expect(res.transactions[0]?.date).toBe('2026-04-05');
    expect(res.transactions[0]?.amountCents).toBe(-3590);
    expect(res.transactions[1]?.amountCents).toBe(-3590);
    expect(res.transactions[0]?.externalId).not.toBe(res.transactions[1]?.externalId);

    expect(res.transactions[2]).toMatchObject({
      date: '2026-04-10',
      amountCents: 150000,
      descriptionRaw: 'Transferência recebida pelo Pix - Empresa X, Ltda',
      paymentMethod: 'pix',
    });
  });

  it('parseia nubank-fatura.csv invertendo o sinal (compras negativas e estorno/pagamento positivos — R1)', () => {
    const content = readFileSync(join(fixturesDir, 'nubank-fatura.csv'), 'utf-8');
    const res = parseNubankCsv(content, { id: accountId, type: 'credit_card' });

    expect(res.format).toBe('csv_nubank_card');
    expect(res.transactions).toHaveLength(4);

    // Compra à vista -> negativo
    expect(res.transactions[0]).toMatchObject({
      date: '2026-04-02',
      amountCents: -2490,
      paymentMethod: 'credit_card_single',
    });

    // Compra parcelada 1/3 -> negativo e installment reconhecido
    expect(res.transactions[1]).toMatchObject({
      date: '2026-04-04',
      amountCents: -15000,
      paymentMethod: 'credit_card_installment',
      installment: {
        number: 1,
        total: 3,
        purchaseDate: null,
        totalAmountCents: null,
      },
    });

    // Estorno (-24.90 no CSV) -> +2490 (R1)
    expect(res.transactions[2]?.amountCents).toBe(2490);

    // Pagamento recebido (-800.00 no CSV) -> +80000
    expect(res.transactions[3]?.amountCents).toBe(80000);
  });
});
