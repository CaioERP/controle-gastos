import { describe, expect, it } from 'vitest';
import { assignDayOccurrences, buildFileExternalId, sha256Hex } from './hash';

describe('hash e buildFileExternalId (A2-01)', () => {
  it('sha256Hex gera hash determinístico de 64 caracteres', () => {
    const h1 = sha256Hex('controle-gastos');
    const h2 = sha256Hex(new TextEncoder().encode('controle-gastos'));
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
  });

  it('duas compras idênticas no mesmo dia recebem dayOccurrence 1 e 2 e geram externalId diferentes; rodar de novo gera os mesmos externalId', () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const rawItems = [
      { date: '2026-04-05', amountCents: -3590, descriptionRaw: 'Uber *Trip' },
      { date: '2026-04-05', amountCents: -3590, descriptionRaw: 'UBER *TRIP' },
      { date: '2026-04-05', amountCents: -1990, descriptionRaw: 'Padaria Central' },
    ];

    const firstRun = assignDayOccurrences(rawItems).map((item) =>
      buildFileExternalId({ ...item, accountId }),
    );
    const secondRun = assignDayOccurrences(rawItems).map((item) =>
      buildFileExternalId({ ...item, accountId }),
    );

    expect(firstRun[0]).not.toBe(firstRun[1]);
    expect(firstRun[0]).toMatch(/^file:[0-9a-f]{32}$/);
    expect(secondRun).toEqual(firstRun);
  });

  it('usa nativeId quando FITID é válido e ignora FITID composto apenas por zeros', () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const withFit = buildFileExternalId({
      accountId,
      date: '2026-04-05',
      amountCents: -4590,
      descriptionRaw: 'IFOOD',
      dayOccurrence: 1,
      nativeId: 'FIT-12345',
    });
    expect(withFit).toBe(`ofx:${accountId}:FIT-12345`);

    const withZeros = buildFileExternalId({
      accountId,
      date: '2026-04-05',
      amountCents: -4590,
      descriptionRaw: 'IFOOD',
      dayOccurrence: 1,
      nativeId: '000000',
    });
    expect(withZeros).toMatch(/^file:[0-9a-f]{32}$/);
  });
});
