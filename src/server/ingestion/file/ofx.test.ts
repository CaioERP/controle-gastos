import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOfx } from './ofx';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'files');

describe('parseOfx (A2-01)', () => {
  const accountId = '11111111-1111-4111-8111-111111111111';

  it('parseia itau-extrato.ofx (SGML 1.x sem tags de fechamento) com datas, centavos e FITID corretos', () => {
    const content = readFileSync(join(fixturesDir, 'itau-extrato.ofx'), 'utf-8');
    const res = parseOfx(content, { id: accountId, type: 'checking' });

    expect(res.format).toBe('ofx');
    expect(res.accountHint).toEqual({
      bankId: '0341',
      accountNumber: '123456-7',
      accountType: 'checking',
    });
    expect(res.transactions).toHaveLength(3);

    expect(res.transactions[0]).toMatchObject({
      date: '2026-04-05',
      amountCents: -4590,
      externalId: `ofx:${accountId}:ITAU20260405001`,
      descriptionRaw: 'IFD*IFOOD RESTAURANTES',
    });

    expect(res.transactions[1]).toMatchObject({
      date: '2026-04-10',
      amountCents: 520000,
      externalId: `ofx:${accountId}:ITAU20260410002`,
      paymentMethod: 'pix',
    });

    // FITID '000000' cai no hash determinístico file:...
    expect(res.transactions[2]?.date).toBe('2026-04-12');
    expect(res.transactions[2]?.amountCents).toBe(-1850);
    expect(res.transactions[2]?.externalId).toMatch(/^file:[0-9a-f]{32}$/);
  });

  it('parseia banco-xml.ofx (XML 2.x) convertendo TRNTYPE=DEBIT sem sinal negativo para negativo (R1)', () => {
    const content = readFileSync(join(fixturesDir, 'banco-xml.ofx'), 'utf-8');
    const res = parseOfx(content, { id: accountId, type: 'credit_card' });

    expect(res.format).toBe('ofx');
    expect(res.accountHint?.accountType).toBe('credit_card');
    expect(res.transactions).toHaveLength(2);

    expect(res.transactions[0]).toMatchObject({
      date: '2026-04-06',
      amountCents: -12990,
      externalId: `ofx:${accountId}:XML2026040601`,
      descriptionRaw: 'AMAZON BR - LIVROS & KINDLE',
    });

    expect(res.transactions[1]).toMatchObject({
      date: '2026-04-08',
      amountCents: 3000,
      externalId: `ofx:${accountId}:XML2026040802`,
    });
  });

  it('FITID repetido no mesmo arquivo gera externalId distinto e estável para cada lançamento', () => {
    const content = [
      '<OFX><BANKTRANLIST>',
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260405<TRNAMT>-10.00<FITID>20260405<MEMO>PADARIA',
      '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260405<TRNAMT>-99.00<FITID>20260405<MEMO>FARMACIA',
      '</BANKTRANLIST></OFX>',
    ].join('\n');
    const ids = parseOfx(content, { id: accountId, type: 'checking' }).transactions.map(
      (t) => t.externalId,
    );
    expect(ids).toEqual([`ofx:${accountId}:20260405`, `ofx:${accountId}:20260405#2`]);
  });
});
