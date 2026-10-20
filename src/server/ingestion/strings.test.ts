import { describe, expect, it } from 'vitest';
import { normalizeForMatch, toDisplayCase } from './strings';

describe('strings ingestion utilities', () => {
  it('normalizeForMatch remove acentos, passa para minúsculas e colapsa espaços', () => {
    expect(normalizeForMatch('  PÃO   DE   AÇÚCAR  ')).toBe('pao de acucar');
    expect(normalizeForMatch('ÁÉÍÓÚ àèìòù ãõ âêîôû ç')).toBe('aeiou aeiou ao aeiou c');
  });

  it('toDisplayCase converte casos da especificação', () => {
    expect(toDisplayCase('PADARIA REAL LTDA')).toBe('Padaria Real Ltda');
    expect(toDisplayCase('PAO DE ACUCAR 1234')).toBe('Pao De Acucar 1234');
    expect(toDisplayCase('NETFLIX.COM')).toBe('Netflix.com');
  });

  it('toDisplayCase preserva siglas e trata domínios e conectivos', () => {
    expect(toDisplayCase('INVESTIMENTOS XP S/A')).toBe('Investimentos XP S/A');
    expect(toDisplayCase('MERCADO BOA ME')).toBe('Mercado Boa ME');
    expect(toDisplayCase('SPOTIFY.COM.BR')).toBe('Spotify.com.br');
    expect(toDisplayCase('')).toBe('');
  });
});
