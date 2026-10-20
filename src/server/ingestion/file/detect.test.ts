import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeFileBuffer, detectAndParseFile } from './detect';

const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'files');

describe('detectAndParseFile e decodeFileBuffer (A2-01)', () => {
  const account = { id: '33333333-3333-4333-8333-333333333333', type: 'checking' as const };

  it('detecta OFX e CSV automaticamente e recusa formato desconhecido com CommandError VALIDATION', () => {
    const ofxContent = readFileSync(join(fixturesDir, 'itau-extrato.ofx'), 'utf-8');
    const ofxRes = detectAndParseFile({ filename: 'itau.ofx', content: ofxContent }, account);
    expect(ofxRes.format).toBe('ofx');

    const csvContent = readFileSync(join(fixturesDir, 'nubank-conta.csv'), 'utf-8');
    const csvRes = detectAndParseFile({ filename: 'nu.csv', content: csvContent }, account);
    expect(csvRes.format).toBe('csv_nubank_checking');

    expect(() =>
      detectAndParseFile({ filename: 'invalido.txt', content: 'foo,bar\n1,2' }, account),
    ).toThrow(/Formato de arquivo não reconhecido/);
  });

  it('decodifica bytes Windows-1252/latin1 quando não são UTF-8 válido', () => {
    // "Descrição" em Windows-1252: 'Descri', 0xE7 ('ç'), 0xE3 ('ã'), 'o'
    const bytes = new Uint8Array([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f]);
    expect(decodeFileBuffer(bytes)).toBe('Descrição');
  });
});
