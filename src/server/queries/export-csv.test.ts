import { describe, expect, it } from 'vitest';
import type { TransactionRow } from './transaction-row';
import { centsToCsv, CSV_HEADER, transactionsToCsv } from './export-csv';

function makeRow(partial: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'tx-1',
    date: '2026-10-15',
    description: 'Padaria Central',
    descriptionRaw: 'PADARIA CENTRAL LTDA',
    amountCents: -2550,
    kind: 'expense',
    paymentMethod: 'pix',
    status: 'posted',
    notes: null,
    needsReview: false,
    categorySource: 'rule',
    categoryConfidence: 1,
    category: { id: 'c1', name: 'Alimentação', color: '#ff0000', icon: 'utensils', parentName: null },
    merchant: { id: 'm1', name: 'Padaria Central' },
    account: { id: 'a1', name: 'Conta Corrente', type: 'checking' },
    institution: { id: 'i1', name: 'Nubank', color: '#820ad1' },
    card: null,
    installment: null,
    tags: [],
    ...partial,
  };
}

describe('exportação para CSV', () => {
  it('uma linha comum, com o cabeçalho certo', () => {
    const row = makeRow();
    const csv = transactionsToCsv([row]);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1]).toBe(
      '15/10/2026;Padaria Central;PADARIA CENTRAL LTDA;-25,50;Despesa;Pix;Alimentação;Padaria Central;Conta Corrente;Nubank;;;Efetivada;;;Não'
    );
  });

  it('um valor negativo e um positivo', () => {
    expect(centsToCsv(-123456)).toBe('-1234,56');
    expect(centsToCsv(5000)).toBe('50,00');
    expect(centsToCsv(0)).toBe('0,00');

    const rowNeg = makeRow({ amountCents: -123456 });
    const rowPos = makeRow({ amountCents: 5000, kind: 'income' });
    const csv = transactionsToCsv([rowNeg, rowPos]);
    const lines = csv.split('\r\n');

    expect(lines[1]!.split(';')[3]).toBe('-1234,56');
    expect(lines[2]!.split(';')[3]).toBe('50,00');
  });

  it('um campo com ; e aspas', () => {
    const row = makeRow({
      description: 'Mercado "Preço Bom"; Loja 2',
      notes: 'Nota com "aspas" e ; ponto e vírgula',
    });
    const csv = transactionsToCsv([row]);
    const lines = csv.split('\r\n');

    expect(lines[1]).toContain(';"Mercado ""Preço Bom""; Loja 2";');
    expect(lines[1]).toContain(';"Nota com ""aspas"" e ; ponto e vírgula";Não');
  });

  it('um campo que começa com =', () => {
    const row = makeRow({
      description: '=SOMA(A1:B2)',
      descriptionRaw: '+12345',
      notes: '-teste',
    });
    const csv = transactionsToCsv([row]);
    const lines = csv.split('\r\n');

    expect(lines[1]).toContain(";'=SOMA(A1:B2);'+12345;");
    expect(lines[1]).toContain(";'-teste;Não");
  });

  it('uma linha com parcela e tags', () => {
    const row = makeRow({
      card: { last4: '1234', isVirtual: false },
      installment: { number: 3, total: 10, groupId: 'g1' },
      status: 'pending',
      needsReview: true,
      category: { id: 'c2', name: 'Delivery', color: '#ff0000', icon: 'bike', parentName: 'Alimentação' },
      tags: [
        { id: 't1', name: 'Viagem', color: '#f00' },
        { id: 't2', name: 'Trabalho', color: '#0f0' },
      ],
    });
    const csv = transactionsToCsv([row]);
    const lines = csv.split('\r\n');

    const cols = lines[1]!.split(';');
    // Categoria: Pai > Filha
    expect(cols[6]).toBe('Alimentação > Delivery');
    // Cartão: final 1234
    expect(cols[10]).toBe('final 1234');
    // Parcela: 3/10
    expect(cols[11]).toBe('3/10');
    // Status: Pendente
    expect(cols[12]).toBe('Pendente');
    // Tags: Viagem, Trabalho
    expect(cols[13]).toBe('Viagem, Trabalho');
    // Revisar: Sim
    expect(cols[15]).toBe('Sim');
  });

  it('usa displayName na coluna Conta quando disponível', () => {
    const row = makeRow({
      account: { id: 'a1', name: 'Conta Original', displayName: 'Minha Conta Principal', type: 'checking' },
    });
    const csv = transactionsToCsv([row]);
    const lines = csv.split('\r\n');
    expect(lines[1]!.split(';')[8]).toBe('Minha Conta Principal');
  });
});